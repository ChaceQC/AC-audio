// ==UserScript==
// @name         牛客网AC音频修改器
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  为了大家修改AC音频的需求，特定制作！支持快捷键 Alt+A 唤醒面板。
// @author       Chace
// @match        https://ac.nowcoder.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_KEYWORD = "acm_pass.wav";
    const MAX_DURATION = 15;
    const SESSION_ID = Date.now();

    // --- 逻辑核心 ---
    function getStoredAudio() {
        return GM_getValue("custom_audio_base64", "");
    }

    let cachedBlobUrl = null;
    function getLocalBlobUrl() {
        if (cachedBlobUrl) return cachedBlobUrl;
        const stored = getStoredAudio();
        if (!stored) return null;
        try {
            const parts = stored.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--) u8arr[n] = bstr.charCodeAt(n);
            const blob = new Blob([u8arr], {type: mime});
            cachedBlobUrl = URL.createObjectURL(blob);
            return cachedBlobUrl;
        } catch (e) { return null; }
    }

    // 1. 网络拦截 (XHR)
    const oldOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.includes(TARGET_KEYWORD)) {
            const newUrl = getLocalBlobUrl();
            if (newUrl) url = newUrl + (newUrl.includes('?') ? '&' : '?') + 't=' + SESSION_ID;
        }
        return oldOpen.apply(this, arguments);
    };

    // 2. Fetch 拦截
    const oldFetch = window.fetch;
    window.fetch = async (...args) => {
        let url = (typeof args[0] === 'string') ? args[0] : args[0].url;
        if (url && url.includes(TARGET_KEYWORD)) {
            const stored = getStoredAudio();
            if (stored) {
                const res = await oldFetch(stored);
                const blob = await res.blob();
                return new Response(blob, { headers: { 'Cache-Control': 'no-cache' } });
            }
        }
        return oldFetch(...args);
    };

    // 3. 原生对象拦截
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function(val) {
            if (typeof val === 'string' && val.includes(TARGET_KEYWORD)) {
                const local = getStoredAudio();
                if (local) val = local;
            }
            descriptor.set.call(this, val);
        },
        get: function() { return descriptor.get.call(this); }
    });

    const OldAudio = window.Audio;
    window.Audio = function(src) {
        if (src && typeof src === 'string' && src.includes(TARGET_KEYWORD)) {
            const local = getStoredAudio();
            if (local) return new OldAudio(local);
        }
        return new OldAudio(src);
    };
    window.Audio.prototype = OldAudio.prototype;

    // --- UI 相关 ---
    function createUI() {
        if (document.getElementById('audio-config-panel')) return;

        const isVisible = GM_getValue("ui_visible", true);
        const panel = document.createElement('div');
        panel.id = 'audio-config-panel';
        panel.setAttribute('style', `position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:12px; border:1px solid #ccc; box-shadow:0 2px 10px rgba(0,0,0,0.2); border-radius:8px; font-family: sans-serif; display: ${isVisible ? 'block' : 'none'};`);

        const hasAudio = getStoredAudio();
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:12px; color:#333; font-weight:bold;">AC音频配置 ${hasAudio ? "✅" : "❌"}</span>
                <span id="hide-ui-btn" style="cursor:pointer; font-size:14px; color:#999;" title="完全隐藏面板 (快捷键 Alt+A 唤醒)">×</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="upload-audio-btn" style="background:#25bb9b; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">上传</button>
                <button id="test-audio-btn" style="background:#f0f0f0; border:1px solid #ccc; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">测试</button>
                <button id="clear-audio-btn" style="background:#ff4d4f; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px; ${hasAudio ? "" : "display:none;"}">清空</button>
            </div>
            <div style="font-size:10px; color:#bbb; margin-top:8px;">Alt + A 可切换面板显示</div>
        `;
        document.body.appendChild(panel);

        // 隐藏逻辑
        const toggleUI = (forceState) => {
            const newState = typeof forceState === 'boolean' ? forceState : panel.style.display === 'none';
            panel.style.display = newState ? 'block' : 'none';
            GM_setValue("ui_visible", newState);
        };

        document.getElementById('hide-ui-btn').onclick = () => {
            if(confirm("确定要隐藏面板吗？隐藏后可通过 Alt + A 键唤醒。")) toggleUI(false);
        };

        // 快捷键监听 (Alt + A)
        window.addEventListener('keydown', (e) => {
            if (e.altKey && e.code === 'KeyA') {
                toggleUI();
            }
        });

        // 按钮事件
        document.getElementById('upload-audio-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const duration = await new Promise(res => {
                    const audio = new OldAudio();
                    audio.src = URL.createObjectURL(file);
                    audio.onloadedmetadata = () => res(audio.duration);
                    audio.onerror = () => res(-1);
                });

                if (duration > MAX_DURATION) return alert(`音频太长(${duration.toFixed(1)}s)`);
                if (duration === -1) return alert('格式不支持');

                const reader = new FileReader();
                reader.onload = (ev) => {
                    GM_setValue("custom_audio_base64", ev.target.result);
                    location.reload();
                };
                reader.readAsDataURL(file);
            };
            input.click();
        };

        document.getElementById('test-audio-btn').onclick = () => {
            const stored = getStoredAudio();
            if (stored) new OldAudio(stored).play().catch(() => alert("播放失败"));
            else alert('未上传音频');
        };

        document.getElementById('clear-audio-btn').onclick = () => {
            if (confirm('恢复默认音频？')) {
                GM_deleteValue("custom_audio_base64");
                location.reload();
            }
        };
    }

    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);

})();