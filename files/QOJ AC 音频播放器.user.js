// ==UserScript==
// @name         QOJ AC 音频播放器
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  监控 QOJ 中属于自己的第一条提交记录，若是显示 AC 则播放音效。
// @author       Gemini & Chace
// @match        *://qoj.ac/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const MAX_DURATION = 15;
    let isPlaying = false;

    // --- 音频核心逻辑 ---
    function getStoredAudio() {
        return GM_getValue("qoj_audio_base64", "");
    }

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

    // --- 修改后的核心判定逻辑：检查 AC 文字 ---
    function checkMyFirstSubmission() {
        // 1. 获取当前登录用户名
        const currentUserElement = document.querySelector('.nav-item.dropdown .uoj-username');
        if (!currentUserElement) return;
        const currentUsername = currentUserElement.textContent.trim();

        // 2. 遍历所有行，寻找属于“我”的第一条
        const rows = document.querySelectorAll('table tbody tr');
        let myFirstRecord = null;

        for (let row of rows) {
            const userLink = row.querySelector('td a.uoj-username');
            if (userLink && userLink.textContent.trim() === currentUsername) {
                myFirstRecord = row;
                break; // 找到属于自己的第一条后立即停止
            }
        }

        // 3. 判定该条记录是否显示为 AC
        if (myFirstRecord) {
            // QOJ 的分数列通常带有 uoj-score 类
            const scoreElement = myFirstRecord.querySelector('td a.uoj-score');
            if (scoreElement) {
                const scoreText = scoreElement.textContent.trim();
                const scoreAttr = scoreElement.getAttribute('data-score');
                const submissionID = scoreElement.getAttribute('href');
                const lastPlayedID = sessionStorage.getItem('last_played_ac_id');

                // 判定条件：文本包含 "AC" 或 含有对勾符号，或者分数属性为 100
                const isAC = scoreText.includes('AC') ||
                           scoreText.includes('✓') ||
                           parseFloat(scoreAttr) === 100;

                if (isAC && submissionID !== lastPlayedID) {
                    playACSound();
                    sessionStorage.setItem('last_played_ac_id', submissionID);
                    console.log(`检测到用户 [${currentUsername}] 的最新提交已 AC！`);
                }
            }
        }
    }

    // --- UI 配置面板 (保留 Alt+A 功能) ---
    function createUI() {
        if (document.getElementById('audio-config-panel')) return;
        const isVisible = GM_getValue("ui_visible", true);
        const panel = document.createElement('div');
        panel.id = 'audio-config-panel';
        panel.setAttribute('style', `position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:12px; border:1px solid #ccc; box-shadow:0 2px 10px rgba(0,0,0,0.2); border-radius:8px; font-family: sans-serif; display: ${isVisible ? 'block' : 'none'};`);

        const hasAudio = getStoredAudio();
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; min-width:180px;">
                <span style="font-size:12px; color:#333; font-weight:bold;">QOJ AC音效配置 ${hasAudio ? "✅" : "❌"}</span>
                <span id="hide-ui-btn" style="cursor:pointer; font-size:14px; color:#999;">×</span>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="upload-audio-btn" style="background:#25bb9b; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">上传</button>
                <button id="test-audio-btn" style="background:#f0f0f0; border:1px solid #ccc; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px;">测试</button>
                <button id="clear-audio-btn" style="background:#ff4d4f; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px; font-size:12px; ${hasAudio ? "" : "display:none;"}">清空</button>
            </div>
            <div style="font-size:10px; color:#bbb; margin-top:8px;">Alt + A 切换面板</div>
        `;
        document.body.appendChild(panel);

        const toggleUI = (f) => {
            const s = typeof f === 'boolean' ? f : panel.style.display === 'none';
            panel.style.display = s ? 'block' : 'none';
            GM_setValue("ui_visible", s);
        };
        document.getElementById('hide-ui-btn').onclick = () => toggleUI(false);
        window.addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyA') toggleUI(); });
        document.getElementById('upload-audio-btn').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'audio/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => { GM_setValue("qoj_audio_base64", ev.target.result); location.reload(); };
                reader.readAsDataURL(file);
            };
            input.click();
        };
        document.getElementById('test-audio-btn').onclick = () => { if (getStoredAudio()) playACSound(); else alert('请先上传音频'); };
        document.getElementById('clear-audio-btn').onclick = () => { if (confirm('重置？')) { GM_deleteValue("qoj_audio_base64"); location.reload(); }};
    }

    createUI();
    // 页面加载后延迟执行，确保一些异步加载的内容渲染完成
    setTimeout(checkMyFirstSubmission, 500);
})();