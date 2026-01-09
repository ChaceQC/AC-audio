// ==UserScript==
// @name         洛谷AC音频播放器
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  监控洛谷AC庆祝图片加载并播放自定义音效。快捷键 Alt+A 唤醒面板。
// @author       Chace
// @match        https://www.luogu.com.cn/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const TARGET_KEYWORD = "ac-congrats.png";
    const MAX_DURATION = 15;
    let isPlaying = false;

    function getStoredAudio() {
        return GM_getValue("luogu_audio_base64", "");
    }

    // 播放逻辑 (处理洛谷 CSP 限制)
    function playACSound() {
        if (isPlaying) return;
        const stored = getStoredAudio();
        if (!stored) return;

        try {
            const parts = stored.split(',');
            const mime = parts[0].match(/:(.*?);/)[1];
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--) u8arr[n] = bstr.charCodeAt(n);
            const blob = new Blob([u8arr], {type: mime});
            const blobUrl = URL.createObjectURL(blob);

            isPlaying = true;
            const audio = new Audio(blobUrl);
            audio.play().then(() => {
                audio.onended = () => { URL.revokeObjectURL(blobUrl); isPlaying = false; };
            }).catch(e => {
                URL.revokeObjectURL(blobUrl);
                isPlaying = false;
            });

            setTimeout(() => { isPlaying = false; }, 5000);
        } catch (e) {
            isPlaying = false;
        }
    }

    // 监控 DOM 变化触发
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'IMG' && node.src && node.src.includes(TARGET_KEYWORD)) {
                    playACSound();
                } else if (node.querySelectorAll) {
                    const imgs = node.querySelectorAll(`img[src*="${TARGET_KEYWORD}"]`);
                    if (imgs.length > 0) playACSound();
                }
            });
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // UI 逻辑
    function createUI() {
        if (document.getElementById('audio-config-panel')) return;

        const isVisible = GM_getValue("ui_visible", true);
        const panel = document.createElement('div');
        panel.id = 'audio-config-panel';
        panel.setAttribute('style', `position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:12px; border:1px solid #ccc; box-shadow:0 2px 10px rgba(0,0,0,0.2); border-radius:8px; font-family: sans-serif; display: ${isVisible ? 'block' : 'none'};`);

        const hasAudio = getStoredAudio();
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; min-width:150px;">
                <span style="font-size:12px; color:#333; font-weight:bold;">洛谷AC音频配置 ${hasAudio ? "✅" : "❌"}</span>
                <span id="hide-ui-btn" style="cursor:pointer; font-size:14px; color:#999;" title="隐藏面板 (Alt+A唤醒)">×</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="upload-audio-btn" style="background:#25bb9b; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">上传</button>
                <button id="test-audio-btn" style="background:#f0f0f0; border:1px solid #ccc; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">测试</button>
                <button id="clear-audio-btn" style="background:#ff4d4f; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px; ${hasAudio ? "" : "display:none;"}">清空</button>
            </div>
            <div style="font-size:10px; color:#bbb; margin-top:8px;">Alt + A 切换显示</div>
        `;
        document.body.appendChild(panel);

        const toggleUI = (force) => {
            const state = typeof force === 'boolean' ? force : panel.style.display === 'none';
            panel.style.display = state ? 'block' : 'none';
            GM_setValue("ui_visible", state);
        };

        document.getElementById('hide-ui-btn').onclick = () => {
            if(confirm("确定隐藏面板？隐藏后按 Alt+A 唤醒。")) toggleUI(false);
        };

        // 统一快捷键 Alt + A
        window.addEventListener('keydown', (e) => {
            if (e.altKey && e.code === 'KeyA') toggleUI();
        });

        document.getElementById('upload-audio-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const tempAudio = new Audio();
                tempAudio.src = URL.createObjectURL(file);
                tempAudio.onloadedmetadata = () => {
                    if (tempAudio.duration > MAX_DURATION) return alert("不能超过15秒");
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        GM_setValue("luogu_audio_base64", ev.target.result);
                        location.reload();
                    };
                    reader.readAsDataURL(file);
                };
            };
            input.click();
        };

        document.getElementById('test-audio-btn').onclick = () => {
            if (getStoredAudio()) playACSound();
            else alert('请先上传音频');
        };

        document.getElementById('clear-audio-btn').onclick = () => {
            if (confirm('恢复默认设置？')) {
                GM_deleteValue("luogu_audio_base64");
                location.reload();
            }
        };
    }

    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);

})();