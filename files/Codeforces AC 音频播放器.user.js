// ==UserScript==
// @name         Codeforces AC 音频播放器
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  修正判定逻辑：优先判断外层 waiting 属性，为 false 时再判定内层 AC 结果。
// @author       Chace
// @match        https://codeforces.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const REFRESH_DELAY = 5000;
    let isPlaying = false;
    let refreshTimer = null;

    function getStoredAudio() { return GM_getValue("cf_audio_base64", ""); }

    function playACSound() {
        if (isPlaying) return;
        const stored = getStoredAudio();
        if (!stored) return;
        try {
            isPlaying = true;
            const audio = new Audio(stored);
            audio.onended = () => { isPlaying = false; };
            audio.play().catch(() => {
                console.warn("AC 音频被拦截，请点击页面激活权限。");
                isPlaying = false;
            });
        } catch (e) { isPlaying = false; }
    }

    function checkCFSubmission() {
        // 1. 获取当前登录用户 profile 路径
        const headerUserLink = document.querySelector('.lang-chooser div a[href^="/profile/"]');
        if (!headerUserLink) return;
        const myProfileHref = headerUserLink.getAttribute('href');

        // 2. 找到状态表格中属于自己的第一行
        const rows = document.querySelectorAll('table.status-frame-datatable tr[data-submission-id]');
        let myLatestRow = null;
        for (let row of rows) {
            if (row.querySelector('td.status-party-cell a[href="' + myProfileHref + '"]')) {
                myLatestRow = row;
                break;
            }
        }

        if (myLatestRow) {
            // 第一层：带有 waiting 属性的 td
            const statusCell = myLatestRow.querySelector('td.status-verdict-cell');
            if (!statusCell) return;

            const isWaiting = statusCell.getAttribute('waiting') === 'true';
            const submissionID = myLatestRow.getAttribute('data-submission-id');
            const lastPlayedID = sessionStorage.getItem('cf_last_played_id');

            if (isWaiting) {
                // 情况 A: 还在评测中 (waiting="true") -> 5秒刷新
                console.log("CF: 检测到 waiting='true'，5秒后刷新...");
                if (!refreshTimer) {
                    refreshTimer = setTimeout(() => {
                        refreshTimer = null;
                        location.reload();
                    }, REFRESH_DELAY);
                }
            } else {
                // 情况 B: waiting="false"，此时才会有后面两层结构
                if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }

                // 第二层 & 第三层：判定 AC 状态
                const verdictWrapper = myLatestRow.querySelector('.submissionVerdictWrapper');
                if (verdictWrapper) {
                    const isAccepted = verdictWrapper.querySelector('.verdict-accepted') !== null;
                    if (isAccepted) {
                        if (submissionID !== lastPlayedID) {
                            sessionStorage.setItem('cf_last_played_id', submissionID);
                            playACSound();
                            console.log("CF: 恭喜 AC! ID:", submissionID);
                        }
                    } else {
                        console.log("CF: 评测结束但未 AC，停止刷新。");
                    }
                }
                else {
                    const isAccepted = statusCell.querySelector('.verdict-accepted') !== null;
                    if (isAccepted) {
                        if (submissionID !== lastPlayedID) {
                            sessionStorage.setItem('cf_last_played_id', submissionID);
                            playACSound();
                            console.log("CF: 恭喜 AC! ID:", submissionID);
                        }
                    } else {
                        console.log("CF: 评测结束但未 AC，停止刷新。");
                    }
                }
            }
        }
    }

    // UI 配置面板保持原样
    function createUI() {
        if (document.getElementById('audio-config-panel')) return;
        const isVisible = GM_getValue("ui_visible", true);
        const panel = document.createElement('div');
        panel.id = 'audio-config-panel';
        panel.setAttribute('style', `position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:12px; border:1px solid #ccc; box-shadow:0 2px 10px rgba(0,0,0,0.2); border-radius:8px; font-family: sans-serif; display: ${isVisible ? 'block' : 'none'};`);

        const hasAudio = getStoredAudio();
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; min-width:180px;">
                <span style="font-size:12px; color:#333; font-weight:bold;">CF AC 音频配置 ${hasAudio ? "✅" : "❌"}</span>
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
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*';
            input.onchange = (e) => {
                const reader = new FileReader();
                reader.onload = (ev) => { GM_setValue("cf_audio_base64", ev.target.result); location.reload(); };
                reader.readAsDataURL(e.target.files[0]);
            };
            input.click();
        };
        document.getElementById('test-audio-btn').onclick = () => { if (getStoredAudio()) playACSound(); else alert('请先上传音频'); };
        document.getElementById('clear-audio-btn').onclick = () => { if (confirm('重置？')) { GM_deleteValue("cf_audio_base64"); location.reload(); }};
    }

    createUI();
    setInterval(checkCFSubmission, 500);
})();
