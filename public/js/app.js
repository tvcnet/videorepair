/* ==============================================
   VideoRepair Control Panel — Application Logic
   ============================================== */

class VideoRepairApp {
    constructor() {
        this.referenceFile = null;
        this.corruptFile = null;
        this.currentJobId = null;
        this.eventSource = null;
        this.init();
    }

    async init() {
        if (window.templatesLoaded) await window.templatesLoaded;
        this.bindElements();
        this.setupUploadZones();
        this.setupOptions();
        this.setupActions();
        this.setupAIAssistant();
        this.checkStatus();
    }

    bindElements() {
        // Upload zones
        this.refZone = document.getElementById('referenceZone');
        this.refInput = document.getElementById('referenceInput');
        this.refContent = document.getElementById('referenceContent');
        this.refFileEl = document.getElementById('referenceFile');
        this.refName = document.getElementById('referenceName');
        this.refSize = document.getElementById('referenceSize');
        this.refRemove = document.getElementById('referenceRemove');

        this.corZone = document.getElementById('corruptZone');
        this.corInput = document.getElementById('corruptInput');
        this.corContent = document.getElementById('corruptContent');
        this.corFileEl = document.getElementById('corruptFile');
        this.corName = document.getElementById('corruptName');
        this.corSize = document.getElementById('corruptSize');
        this.corRemove = document.getElementById('corruptRemove');

        // Buttons
        this.repairBtn = document.getElementById('repairBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.newRepairBtn = document.getElementById('newRepairBtn');

        // Panels
        this.progressPanel = document.getElementById('progressPanel');
        this.previewPanel = document.getElementById('previewPanel');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.progressTitle = document.getElementById('progressTitle');
        this.terminalBody = document.getElementById('terminalBody');

        // Videos
        this.refVideo = document.getElementById('refVideo');
        this.repairedVideo = document.getElementById('repairedVideo');
        this.repairStats = document.getElementById('repairStats');

        // Status
        this.statusIndicator = document.getElementById('statusIndicator');

        // AI Advisor
        this.aiProblemInput = document.getElementById('aiProblemInput');
        this.consultGeminiBtn = document.getElementById('consultGeminiBtn');
    }

    // --- Upload Zones ---
    setupUploadZones() {
        this.initDropZone(this.refZone, this.refInput, 'reference');
        this.initDropZone(this.corZone, this.corInput, 'corrupt');

        this.refRemove.addEventListener('click', e => { e.stopPropagation(); this.clearFile('reference'); });
        this.corRemove.addEventListener('click', e => { e.stopPropagation(); this.clearFile('corrupt'); });
    }

    initDropZone(zone, input, type) {
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

        input.addEventListener('change', () => {
            if (input.files.length > 0) this.uploadFile(input.files[0], type);
        });

        ['dragenter', 'dragover'].forEach(evt => {
            zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
        });
        ['dragleave', 'drop'].forEach(evt => {
            zone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
        });
        zone.addEventListener('drop', e => {
            const files = e.dataTransfer.files;
            if (files.length > 0) this.uploadFile(files[0], type);
        });
    }

    async uploadFile(file, type) {
        const zone = type === 'reference' ? this.refZone : this.corZone;
        const contentEl = type === 'reference' ? this.refContent : this.corContent;

        // Show upload spinner
        const overlay = document.createElement('div');
        overlay.className = 'upload-progress';
        overlay.innerHTML = '<div class="spinner"></div><span>Uploading...</span>';
        zone.style.position = 'relative';
        zone.appendChild(overlay);

        const formData = new FormData();
        formData.append('video', file);

        try {
            const resp = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Upload failed');
            }
            const data = await resp.json();

            if (type === 'reference') {
                this.referenceFile = data;
                this.refName.textContent = data.originalname;
                this.refSize.textContent = this.formatSize(data.size);
                this.refContent.classList.add('hidden');
                this.refFileEl.classList.remove('hidden');
                this.refZone.classList.add('has-file');
            } else {
                this.corruptFile = data;
                this.corName.textContent = data.originalname;
                this.corSize.textContent = this.formatSize(data.size);
                this.corContent.classList.add('hidden');
                this.corFileEl.classList.remove('hidden');
                this.corZone.classList.add('has-file');
            }

            this.updateRepairButton();
            this.showToast('success', `${file.name} uploaded successfully`);
        } catch (err) {
            this.showToast('error', err.message);
        } finally {
            overlay.remove();
        }
    }

    clearFile(type) {
        if (type === 'reference') {
            if (this.referenceFile) {
                fetch(`/api/files/${this.referenceFile.filename}`, { method: 'DELETE' }).catch(() => { });
            }
            this.referenceFile = null;
            this.refContent.classList.remove('hidden');
            this.refFileEl.classList.add('hidden');
            this.refZone.classList.remove('has-file');
            this.refInput.value = '';
        } else {
            if (this.corruptFile) {
                fetch(`/api/files/${this.corruptFile.filename}`, { method: 'DELETE' }).catch(() => { });
            }
            this.corruptFile = null;
            this.corContent.classList.remove('hidden');
            this.corFileEl.classList.add('hidden');
            this.corZone.classList.remove('has-file');
            this.corInput.value = '';
        }
        this.updateRepairButton();
    }

    updateRepairButton() {
        this.repairBtn.disabled = !(this.referenceFile && this.corruptFile);
    }

    // --- Options ---
    setupOptions() {
        const toggle = document.getElementById('optionsToggle');
        const body = document.getElementById('optionsBody');
        const btn = toggle.querySelector('.collapse-btn');
        let collapsed = false;

        toggle.addEventListener('click', () => {
            collapsed = !collapsed;
            if (collapsed) {
                body.style.maxHeight = body.scrollHeight + 'px';
                requestAnimationFrame(() => { body.classList.add('collapsed'); });
                btn.classList.add('collapsed');
            } else {
                body.classList.remove('collapsed');
                body.style.maxHeight = body.scrollHeight + 'px';
                btn.classList.remove('collapsed');
            }
        });

        body.style.maxHeight = body.scrollHeight + 'px';
    }

    getOptions() {
        return {
            skipUnknown: document.querySelector('[name="skipUnknown"]').checked,
            stretchVideo: document.querySelector('[name="stretchVideo"]').checked,
            keepUnknown: document.querySelector('[name="keepUnknown"]').checked,
            searchMdat: document.querySelector('[name="searchMdat"]').checked,
            noCTTS: document.querySelector('[name="noCTTS"]').checked,
            dynamicStats: document.querySelector('[name="dynamicStats"]').checked,
            stepSize: document.getElementById('stepSizeInput').value
        };
    }

    // --- Actions ---
    setupActions() {
        this.repairBtn.addEventListener('click', () => this.startRepair());
        this.cancelBtn.addEventListener('click', () => this.cancelRepair());
        this.newRepairBtn.addEventListener('click', () => this.resetUI());
    }

    async startRepair() {
        if (!this.referenceFile || !this.corruptFile) return;

        // Show progress panel
        this.progressPanel.classList.remove('hidden');
        this.previewPanel.classList.add('hidden');
        this.repairBtn.classList.add('hidden');
        this.cancelBtn.classList.remove('hidden');
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0%';
        this.progressTitle.textContent = 'Repairing...';
        this.terminalBody.innerHTML = '';

        this.progressPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const resp = await fetch('/api/repair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reference: this.referenceFile.filename,
                    corrupt: this.corruptFile.filename,
                    options: this.getOptions()
                })
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error || 'Failed to start repair');
            }

            const { jobId } = await resp.json();
            this.currentJobId = jobId;
            this.connectProgress(jobId);
        } catch (err) {
            this.showToast('error', err.message);
            this.repairBtn.classList.remove('hidden');
            this.cancelBtn.classList.add('hidden');
        }
    }

    connectProgress(jobId) {
        if (this.eventSource) this.eventSource.close();

        this.eventSource = new EventSource(`/api/progress/${jobId}`);

        this.eventSource.addEventListener('log', e => {
            const data = JSON.parse(e.data);
            this.appendLog(data);
        });

        this.eventSource.addEventListener('progress', e => {
            const { percent } = JSON.parse(e.data);
            this.progressFill.style.width = `${percent}%`;
            this.progressText.textContent = `${Math.round(percent)}%`;
        });

        this.eventSource.addEventListener('complete', e => {
            const result = JSON.parse(e.data);
            this.onRepairComplete(result);
            this.eventSource.close();
            this.eventSource = null;
        });

        this.eventSource.addEventListener('error', e => {
            let msg = 'Repair failed';
            try { const d = JSON.parse(e.data); msg = d.message || msg; } catch (_) { }
            this.onRepairError(msg);
            this.eventSource.close();
            this.eventSource = null;
        });
    }

    appendLog(entry) {
        const line = document.createElement('div');
        line.className = `log-line log-${entry.type}`;
        const time = new Date(entry.time);
        const ts = time.toLocaleTimeString('en-US', { hour12: false });
        line.innerHTML = `<span class="log-time">[${ts}]</span>${this.escapeHtml(entry.text)}`;
        this.terminalBody.appendChild(line);
        this.terminalBody.scrollTop = this.terminalBody.scrollHeight;
    }

    onRepairComplete(result) {
        this.progressFill.style.width = '100%';
        this.progressText.textContent = '100%';
        this.progressTitle.textContent = 'Repair Complete!';
        this.cancelBtn.classList.add('hidden');
        this.repairBtn.classList.remove('hidden');

        // Show preview
        this.previewPanel.classList.remove('hidden');
        this.refVideo.src = this.referenceFile.path;
        this.repairedVideo.src = result.path;
        this.downloadBtn.href = result.path;
        this.downloadBtn.download = result.filename;
        this.repairStats.textContent = `Repaired: ${result.filename} (${this.formatSize(result.size)})`;

        this.previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.showToast('success', 'Video repaired successfully!');
    }

    onRepairError(message) {
        this.progressTitle.textContent = 'Repair Failed';
        this.cancelBtn.classList.add('hidden');
        this.repairBtn.classList.remove('hidden');
        this.showToast('error', message);
    }

    async cancelRepair() {
        if (!this.currentJobId) return;
        try {
            await fetch(`/api/repair/${this.currentJobId}/cancel`, { method: 'POST' });
        } catch (_) { }
        if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
        this.cancelBtn.classList.add('hidden');
        this.repairBtn.classList.remove('hidden');
        this.progressTitle.textContent = 'Cancelled';
        this.showToast('info', 'Repair cancelled');
    }

    resetUI() {
        this.progressPanel.classList.add('hidden');
        this.previewPanel.classList.add('hidden');
        this.cancelBtn.classList.add('hidden');
        this.repairBtn.classList.remove('hidden');
        this.clearFile('reference');
        this.clearFile('corrupt');
        this.terminalBody.innerHTML = '';
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0%';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Status ---
    async checkStatus() {
        try {
            const resp = await fetch('/api/status');
            const data = await resp.json();
            const indicator = this.statusIndicator;
            if (data.available) {
                indicator.className = 'status-badge status-online';
                indicator.querySelector('.status-label').textContent = 'Engine Ready';
            } else {
                indicator.className = 'status-badge status-offline';
                indicator.querySelector('.status-label').textContent = 'Engine Not Built';
                this.showToast('error', 'Untrunc binary not found. Please build it first — see PROJECT.md for instructions.');
            }
        } catch (err) {
            this.statusIndicator.className = 'status-badge status-offline';
            this.statusIndicator.querySelector('.status-label').textContent = 'Offline';
        }
    }

    // --- AI Assistant ---
    setupAIAssistant() {
        if (!this.consultGeminiBtn) return;

        this.consultGeminiBtn.addEventListener('click', async () => {
            const problem = this.aiProblemInput.value.trim();
            if (!problem) {
                this.showToast('info', 'Please describe your video problem first.');
                this.aiProblemInput.focus();
                return;
            }

            const prompt = this.generateAIPrompt(problem);

            try {
                await navigator.clipboard.writeText(prompt);
                this.showToast('success', 'Technical brief copied to clipboard! Paste it into your AI.');
            } catch (err) {
                this.showToast('error', 'Failed to copy to clipboard.');
            }
        });
    }

    generateAIPrompt(userProblem) {
        return `I am trying to repair a corrupted video file using the 'untrunc' engine. 

MY SPECIFIC PROBLEM:
"${userProblem}"

I have a working reference file from the same camera/setting. My repair tool (VideoRepair) provides the following 7 technical options. 

Please analyze my problem and recommend the best combination of these settings:

1. Skip Unknown Sequences (Skips corrupt NAL blocks that don't match expected structure)
2. Stretch Video (Stretches video tracks to match audio duration to fix sync)
3. Keep Unknown Data (Includes unrecognized data sequences in final output)
4. Search for mdat (Deep scan for media data atoms if header is missing)
5. No CTTS Restore (Disables restoration of composition time offset table)
6. Dynamic Statistics (Calculates sample statistics dynamically from reference file)
7. Step Size (Custom scan chunk size in bytes - 0 means auto)

Based on my description, what specific combination should I try? Provide a technical reason for each recommendation.`;
    }

    // --- Helpers ---
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(type, message) {
        const container = document.getElementById('toastContainer');
        const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' }[type] || 'fa-info-circle';
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fas ${icon}"></i><span>${this.escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-removing');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
}

// Launch
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoRepairApp();
});
