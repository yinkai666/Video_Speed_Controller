const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 仅在测试沙箱中暴露控制器；发布脚本仍使用原来的 IIFE 启动方式。
const source = fs.readFileSync(path.join(__dirname, '../video-speed-controller.js'), 'utf8')
    .replace('controller.start();', 'globalThis.controller = controller;');

class Element extends EventTarget {
    constructor(tagName = 'DIV') {
        super();
        this.tagName = tagName;
        this.style = {};
        this.children = [];
        this.isConnected = true;
    }
    appendChild(child) { this.children.push(child); child.parentElement = this; }
    removeChild(child) { this.children = this.children.filter(item => item !== child); }
    remove() { this.parentElement?.removeChild(this); this.isConnected = false; }
    getRootNode() { return this.root || this.ownerDocument; }
}

function makeVideo({ paused = true, readyState = 1, main = false, width = 300 } = {}) {
    const video = new Element('VIDEO');
    Object.assign(video, { paused, readyState, ended: false, playbackRate: 1, currentTime: 10, volume: 0.5 });
    video.parentElement = new Element();
    video.matches = selector => main && selector === '.html5-main-video';
    video.getBoundingClientRect = () => ({ width });
    video.play = () => { video.paused = false; video.ended = false; video.dispatchEvent(new Event('play')); return Promise.resolve(); };
    video.pause = () => { video.paused = true; video.dispatchEvent(new Event('pause')); };
    return video;
}

function boot(videos, hostname = 'example.com') {
    let nextId = 0;
    const timers = new Map();
    const observers = [];
    const location = { hostname, pathname: '/video/test', href: `https://${hostname}/video/test` };
    const document = new Element('DOCUMENT');
    document.body = new Element('BODY');
    document.videos = videos;
    videos.forEach(video => { video.ownerDocument ||= document; });
    document.createElement = tag => new Element(tag.toUpperCase());
    document.querySelectorAll = selector => selector === 'video' || selector === '*' ? document.videos : [];
    const window = new Element('WINDOW');
    Object.assign(window, { location, getComputedStyle: () => ({ position: 'relative' }) });
    class MutationObserver {
        constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
        observe(target) { this.targets.add(target); }
        disconnect() { this.targets.clear(); }
    }
    const context = {
        window, document, location, MutationObserver,
        console: { log() {}, warn() {}, error() {} },
        history: { pushState() {}, replaceState() {} },
        GM_getValue: (key, fallback) => fallback, GM_setValue() {}, GM_registerMenuCommand() {},
        setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return {
        controller: context.controller, document,
        notifyMutation(root, mutations) {
            for (const observer of [...observers]) {
                if (observer.targets.has(root)) observer.callback(mutations);
            }
        },
        advance(delay) {
            for (const [id, timer] of [...timers]) {
                if (timer.delay === delay) { timers.delete(id); timer.callback(); }
            }
        }
    };
}

function key(code, repeat = false) {
    return { code, repeat, composedPath: () => [], preventDefault() {}, stopImmediatePropagation() {} };
}

test('initial scan selects the playing video and highlights its button', () => {
    const videos = [makeVideo(), makeVideo({ paused: false })];
    const { controller: c } = boot(videos);
    c.setupVideos(videos);
    assert.equal(c.activeVideo, videos[1]);
    assert.equal(c.videoControlButtons.get(videos[1]).style.backgroundColor, 'rgba(0, 128, 255, 0.8)');
});

test('latest play wins, including videos discovered in later scans', () => {
    const videos = [makeVideo({ paused: false }), makeVideo()];
    const { controller: c } = boot(videos);
    c.setupVideos(videos);
    videos[1].play();
    assert.equal(c.activeVideo, videos[1]);
    videos[0].play();
    assert.equal(c.activeVideo, videos[0]);
    const third = makeVideo();
    c.setupVideos([...videos, third]); third.play();
    assert.equal(c.activeVideo, third);
});

test('pause/ended fall back to another playing video; all paused retain target', () => {
    const videos = [makeVideo(), makeVideo()];
    const { controller: c } = boot(videos);
    c.setupVideos(videos);
    videos[0].play(); videos[1].play();
    assert.equal(c.activeVideo, videos[1]);
    videos[1].pause();
    assert.equal(c.activeVideo, videos[0]);
    videos[1].play(); videos[1].ended = true; videos[1].dispatchEvent(new Event('ended'));
    assert.equal(c.activeVideo, videos[0]);
    videos[0].pause();
    assert.equal(c.activeVideo, videos[0]);
    c.handleKeyDown(key('Space'));
    assert.equal(videos[0].paused, false);
});

test('manual button selects until another video starts playing', () => {
    const videos = [makeVideo(), makeVideo({ paused: false })];
    const { controller: c } = boot(videos);
    c.setupVideos(videos);
    c.videoControlButtons.get(videos[0]).dispatchEvent(new Event('click'));
    c.setupVideos(videos);
    assert.equal(c.activeVideo, videos[0]);
    videos[1].play();
    assert.equal(c.activeVideo, videos[1]);
});

test('site main-video rules break initial ties but do not override a single playing video', () => {
    for (const hostname of ['www.youtube.com', 'www.bilibili.com']) {
        const videos = [makeVideo({ main: true, width: 800 }), makeVideo({ paused: false })];
        const { controller: c } = boot(videos, hostname);
        c.setupVideos(videos);
        assert.equal(c.activeVideo, videos[1]);
        assert.equal(c.videoControlButtons.size, 0);
        c.cleanup();
        videos[0].paused = false;
        c.setupVideos(videos);
        assert.equal(c.activeVideo, videos[0]);
    }
});

test('rescanning does not duplicate play listeners or reset adjusted playback rates', () => {
    const videos = [makeVideo(), makeVideo()];
    let playListenerCount = 0;
    const originalAdd = videos[1].addEventListener.bind(videos[1]);
    videos[1].addEventListener = (type, ...args) => { if (type === 'play') playListenerCount++; originalAdd(type, ...args); };
    const { controller: c } = boot(videos);
    c.setupVideos(videos); videos[1].play(); videos[1].playbackRate = 1.75;
    c.setupVideos(videos); c.setupVideos(videos);
    assert.equal(playListenerCount, 1);
    assert.equal(c.activeVideo, videos[1]);
    assert.equal(videos[1].playbackRate, 1.75);
});

test('unready videos are followed and initialized once metadata loads', () => {
    const videos = [makeVideo({ readyState: 0 }), makeVideo({ readyState: 0 })];
    const { controller: c } = boot(videos);
    c.settings.defaultRate = 1.5;
    c.setupVideos(videos);
    videos[1].readyState = 1;
    videos[1].dispatchEvent(new Event('loadedmetadata'));
    videos[1].play();
    assert.equal(c.activeVideo, videos[1]);
    assert.equal(videos[1].playbackRate, 1.5);
    assert.ok(c.videoControlButtons.has(videos[1]));
});

test('removed targets are replaced and their media listeners are detached', () => {
    const videos = [makeVideo({ paused: false }), makeVideo()];
    const { controller: c, document } = boot(videos);
    c.setupVideos(videos); c._setupPersistentObservers();
    videos[0].isConnected = false;
    document.videos = [videos[1]];
    c.mainObserver.callback([{ removedNodes: [{ querySelectorAll: () => [videos[0]] }], addedNodes: [] }]);
    assert.equal(c.activeVideo, videos[1]);
    videos[0].play();
    assert.equal(c.activeVideo, videos[1]);
    c.setupVideos([]);
    assert.equal(c.activeVideo, null);
});

test('cleanup detaches media listeners and allows a clean rescan', () => {
    const videos = [makeVideo(), makeVideo()];
    const { controller: c } = boot(videos);
    c.setupVideos(videos); videos[1].play();
    assert.equal(c.activeVideo, videos[1]);
    c.cleanup(); videos[1].play();
    assert.equal(c.activeVideo, null);
    c.setupVideos(videos); videos[0].play();
    assert.equal(c.activeVideo, videos[0]);
});

test('switch during a long press restores old rate and does not seek or boost the new target', () => {
    for (const boosted of [false, true]) {
        const videos = [makeVideo({ paused: false }), makeVideo()];
        const { controller: c, advance } = boot(videos);
        c.setupVideos(videos); videos[0].playbackRate = 1.5;
        c.handleKeyDown(key('ArrowRight'));
        if (boosted) { advance(200); assert.equal(videos[0].playbackRate, 2.5); }
        videos[1].play(); advance(200);
        c.handleKeyDown(key('ArrowRight', true)); advance(200);
        c.handleKeyUp(key('ArrowRight'));
        assert.equal(c.activeVideo, videos[1]);
        assert.equal(videos[0].playbackRate, 1.5);
        assert.equal(videos[1].playbackRate, 1);
        assert.equal(videos[1].currentTime, 10);
        c.handleKeyDown(key('ArrowRight')); c.handleKeyUp(key('ArrowRight'));
        assert.equal(videos[1].currentTime, 15);
    }
});

test('cleanup cancels an outstanding long-press timer', () => {
    const videos = [makeVideo({ paused: false })];
    const { controller: c, advance } = boot(videos);
    c.setupVideos(videos); c.handleKeyDown(key('ArrowRight')); c.cleanup();
    assert.doesNotThrow(() => advance(200));
    c.handleKeyUp(key('ArrowRight'));
});

test('initialization does not overwrite a play event received while discovery resolves', async () => {
    const videos = [makeVideo(), makeVideo()];
    const { controller: c } = boot(videos);
    const pending = c.initialize();
    await Promise.resolve();
    videos[1].play();
    await pending;
    assert.equal(c.activeVideo, videos[1]);
});

test('cleanup cancels a pending scan so media listeners are not reattached', () => {
    const videos = [makeVideo(), makeVideo()];
    const { controller: c, advance } = boot(videos);
    c.setupVideos(videos); c.debouncedDetectAndSetupVideos(); c.cleanup();
    advance(500); videos[1].play();
    assert.equal(c.activeVideo, null);
    assert.equal(c.videoControlButtons.size, 0);
});

test('a newly discovered autoplay video takes over from a previously observed playing video', () => {
    const first = makeVideo();
    const { controller: c } = boot([first]);
    c.setupVideos([first]); first.play();
    const added = makeVideo({ paused: false });
    c.setupVideos([first, added]);
    assert.equal(c.activeVideo, added);
});

test('newly discovered autoplay videos use site rules when their play order is unknown', () => {
    const first = makeVideo();
    const { controller: c } = boot([first], 'www.youtube.com');
    c.setupVideos([first]); first.play();
    const preview = makeVideo({ paused: false });
    const main = makeVideo({ paused: false, main: true });
    c.setupVideos([first, preview, main]);
    assert.equal(c.activeVideo, main);
});

test('video removal within an observed shadow root or frame document selects a surviving target', () => {
    for (const tag of ['SHADOWROOT', 'DOCUMENT']) {
        const root = new Element(tag);
        const videos = [makeVideo({ paused: false }), makeVideo()];
        videos[0].root = root;
        if (tag === 'DOCUMENT') videos[0].ownerDocument = root;
        const { controller: c, document, notifyMutation } = boot(videos);
        c.setupVideos(videos); c._setupPersistentObservers();
        videos[0].isConnected = false;
        document.videos = [videos[1]];
        notifyMutation(root, [{ removedNodes: [videos[0]], addedNodes: [] }]);
        assert.equal(c.activeVideo, videos[1]);
        videos[0].play();
        assert.equal(c.activeVideo, videos[1]);
    }
});
