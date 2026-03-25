/* ============================================
   ZipEasy - 웹 압축 도구 핵심 로직
   JSZip + FileSaver.js 기반
   ============================================ */

// === 전역 상태 ===
const state = {
    compressFiles: [],       // 압축할 파일 목록
    extractedData: null,     // 압축 해제된 데이터
    compressedBlob: null,    // 생성된 ZIP blob
    originalSize: 0,
    compressedSize: 0,
    mode: 'compress',        // 'compress' | 'extract'
    cancelled: false,
    saveFileHandle: null,    // File System Access API 핸들 (저장 위치)
};

// === DOM 요소 ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Screens
const screenHome = $('#screenHome');
const screenProgress = $('#screenProgress');
const screenComplete = $('#screenComplete');

// Compress
const compressDropZone = $('#compressDropZone');
const compressFileInput = $('#compressFileInput');
const compressFileList = $('#compressFileList');
const compressOptions = $('#compressOptions');
const startCompressBtn = $('#startCompress');
const zipFileNameInput = $('#zipFileName');

// Extract
const extractDropZone = $('#extractDropZone');
const extractFileInput = $('#extractFileInput');

// Progress
const progressTitle = $('#progressTitle');
const progressPercent = $('#progressPercent');
const progressRing = $('#progressRing');
const progressFileList = $('#progressFileList');
const progressInfo = $('#progressInfo');
const progressBarFill = $('#progressBarFill');
const cancelBtn = $('#cancelBtn');

// Complete
const completeTitle = $('#completeTitle');
const completeSubtitle = $('#completeSubtitle');
const statOriginal = $('#statOriginal');
const statCompressed = $('#statCompressed');
const statSaved = $('#statSaved');
const outputFileName = $('#outputFileName');
const outputFileCount = $('#outputFileCount');
const extractedFiles = $('#extractedFiles');
const extractedList = $('#extractedList');
const statsRow = $('#statsRow');
const downloadBtn = $('#downloadBtn');
const newTaskBtn = $('#newTaskBtn');

// Save Location
const chooseSaveLocationBtn = $('#chooseSaveLocation');
const saveLocationText = $('#saveLocationText');
const saveLocationHint = $('#saveLocationHint');

// Logo
const logo = $('.logo');

// === 화면 전환 ===
function showScreen(screenId) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#${screenId}`).classList.add('active');
}

// === 유틸리티 ===
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
        hwp: '📝', hwpx: '📝',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🎨',
        mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
        mp3: '🎵', wav: '🎵', flac: '🎵',
        zip: '📦', rar: '📦', '7z': '📦',
        js: '⚙️', css: '🎨', html: '🌐',
        xlsx: '📊', xls: '📊', csv: '📊',
        pptx: '📽️', ppt: '📽️',
    };
    return icons[ext] || '📄';
}

// UI 업데이트를 위한 yield (브라우저가 화면을 다시 그릴 시간을 줌)
function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// === 파일 목록 렌더링 (압축 모드) ===
function renderCompressFileList() {
    compressFileList.innerHTML = '';

    if (state.compressFiles.length === 0) {
        compressOptions.style.display = 'none';
        return;
    }

    compressOptions.style.display = 'block';

    state.compressFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-item-info">
                <span class="file-item-icon">${getFileIcon(file.name)}</span>
                <span class="file-item-name">${file.name}</span>
            </div>
            <span class="file-item-size">${formatSize(file.size)}</span>
            <button class="file-item-remove" data-index="${index}" title="제거">✕</button>
        `;
        compressFileList.appendChild(item);
    });

    // 파일 제거 버튼 이벤트
    compressFileList.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            state.compressFiles.splice(idx, 1);
            renderCompressFileList();
        });
    });
}

// === 파일 추가 (압축 모드) ===
function addCompressFiles(files) {
    for (const file of files) {
        // 중복 체크
        if (!state.compressFiles.find(f => f.name === file.name && f.size === file.size)) {
            state.compressFiles.push(file);
        }
    }
    renderCompressFileList();
}

// === 드래그 앤 드롭 설정 ===
function setupDropZone(dropZone, fileInput, handler) {
    // 드래그 이벤트
    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handler(files);
    });

    // 클릭으로 파일 선택
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handler(e.target.files);
        e.target.value = '';
    });
}

// === 진행률 업데이트 ===
function updateProgress(percent, currentFile, fileStatuses) {
    const p = Math.min(Math.round(percent), 100);

    // 원형 프로그레스
    const circumference = 2 * Math.PI * 80;
    const offset = circumference - (p / 100) * circumference;
    progressRing.style.strokeDashoffset = offset;

    // 퍼센트 텍스트
    progressPercent.textContent = p + '%';

    // 프로그레스 바
    progressBarFill.style.width = p + '%';

    // 파일 상태 목록
    if (fileStatuses) {
        progressFileList.innerHTML = '';
        fileStatuses.forEach(fs => {
            const statusIcon = fs.status === 'completed' ? '✓' :
                fs.status === 'in-progress' ? '⟳' : '○';
            const item = document.createElement('div');
            item.className = `progress-file-item ${fs.status}`;
            item.innerHTML = `
                <span class="progress-file-status">${statusIcon}</span>
                <span>${fs.name}</span>
            `;
            progressFileList.appendChild(item);
        });
    }

    // 정보 텍스트
    if (currentFile) {
        progressInfo.innerHTML = `<span>처리 중: ${currentFile}</span>`;
    }
}

// === 저장 위치 선택 (File System Access API) ===
async function chooseSaveLocation() {
    const fileName = (zipFileNameInput.value || 'my_files') + '.zip';

    if (!window.showSaveFilePicker) {
        alert('이 브라우저는 저장 위치 선택을 지원하지 않습니다.\nChrome 또는 Edge 브라우저를 사용해주세요.\n기본 다운로드 폴더에 저장됩니다.');
        return;
    }

    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
                description: 'ZIP 파일',
                accept: { 'application/zip': ['.zip'] }
            }]
        });
        state.saveFileHandle = handle;
        saveLocationText.textContent = handle.name;
        saveLocationHint.textContent = '저장 위치가 선택되었습니다';
        saveLocationHint.style.color = 'var(--primary)';
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('저장 위치 선택 오류:', err);
        }
    }
}

// === 파일 저장 (File System Access API 또는 FileSaver 폴백) ===
async function saveFile(blob, fileName) {
    if (state.saveFileHandle) {
        try {
            const writable = await state.saveFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err) {
            console.error('파일 저장 오류, 기본 다운로드로 전환:', err);
        }
    }
    saveAs(blob, fileName);
}

// === 압축 실행 ===
async function compressFiles() {
    if (state.compressFiles.length === 0) return;

    state.mode = 'compress';
    state.cancelled = false;
    state.originalSize = state.compressFiles.reduce((sum, f) => sum + f.size, 0);

    // 진행 화면으로 전환
    showScreen('screenProgress');
    progressTitle.textContent = '압축 중...';

    const zip = new JSZip();
    const totalFiles = state.compressFiles.length;
    const fileStatuses = state.compressFiles.map(f => ({
        name: f.name,
        status: 'waiting'
    }));

    updateProgress(0, null, fileStatuses);

    try {
        // 각 파일을 ZIP에 추가
        for (let i = 0; i < totalFiles; i++) {
            if (state.cancelled) return goHome();

            const file = state.compressFiles[i];
            fileStatuses[i].status = 'in-progress';
            updateProgress((i / totalFiles) * 80, file.name, fileStatuses);
            await yieldToUI();

            try {
                const data = await readFileAsync(file);
                zip.file(file.name, data);
            } catch (readErr) {
                console.error(`파일 읽기 오류 (${file.name}):`, readErr);
                fileStatuses[i].status = 'completed';
                updateProgress(((i + 1) / totalFiles) * 80, file.name, fileStatuses);
                continue;
            }

            fileStatuses[i].status = 'completed';
            updateProgress(((i + 1) / totalFiles) * 80, file.name, fileStatuses);
            await yieldToUI();
        }

        if (state.cancelled) return goHome();

        // ZIP 생성
        progressInfo.innerHTML = '<span>ZIP 파일 생성 중...</span>';
        updateProgress(85, null, fileStatuses);

        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            const p = 85 + (metadata.percent / 100) * 15;
            updateProgress(p, `ZIP 생성 중... ${Math.round(metadata.percent)}%`, fileStatuses);
        });

        if (state.cancelled) return goHome();

        state.compressedBlob = blob;
        state.compressedSize = blob.size;

        showCompressComplete();
    } catch (err) {
        console.error('압축 오류:', err);
        alert('압축 중 오류가 발생했습니다: ' + err.message);
        goHome();
    }
}

// === 파일 비동기 읽기 ===
function readFileAsync(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// === 압축 완료 화면 ===
async function showCompressComplete() {
    showScreen('screenComplete');

    const fileName = (zipFileNameInput.value || 'my_files') + '.zip';
    const savedPercent = ((1 - state.compressedSize / state.originalSize) * 100).toFixed(1);

    completeTitle.textContent = '압축 완료!';

    statsRow.style.display = 'grid';
    statOriginal.textContent = formatSize(state.originalSize);
    statCompressed.textContent = formatSize(state.compressedSize);
    statSaved.textContent = savedPercent + '%';

    outputFileName.textContent = fileName;
    outputFileCount.textContent = state.compressFiles.length + '개 파일';

    extractedFiles.style.display = 'none';

    // 저장 위치를 미리 선택했으면 자동 저장
    if (state.saveFileHandle) {
        try {
            const writable = await state.saveFileHandle.createWritable();
            await writable.write(state.compressedBlob);
            await writable.close();
            completeSubtitle.textContent = '파일이 선택한 위치에 저장되었습니다';
            downloadBtn.style.display = 'none';
        } catch (err) {
            console.error('자동 저장 실패:', err);
            completeSubtitle.textContent = '자동 저장에 실패했습니다. 아래 버튼으로 저장해주세요.';
            downloadBtn.style.display = '';
            downloadBtn.textContent = '📥 다른 위치에 저장';
            downloadBtn.onclick = () => saveAs(state.compressedBlob, fileName);
        }
    } else {
        completeSubtitle.textContent = '파일이 성공적으로 압축되었습니다';
        downloadBtn.style.display = '';
        downloadBtn.textContent = '📥 저장 위치 선택';
        downloadBtn.onclick = async () => {
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{ description: 'ZIP 파일', accept: { 'application/zip': ['.zip'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(state.compressedBlob);
                    await writable.close();
                    completeSubtitle.textContent = '파일이 선택한 위치에 저장되었습니다';
                    downloadBtn.style.display = 'none';
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('저장 오류:', err);
                        saveAs(state.compressedBlob, fileName);
                    }
                }
            } else {
                saveAs(state.compressedBlob, fileName);
            }
        };
    }
}

// === 압축 해제 실행 ===
async function extractFile(file) {
    state.mode = 'extract';
    state.cancelled = false;
    state.originalSize = file.size;

    showScreen('screenProgress');
    progressTitle.textContent = '압축 해제 중...';
    updateProgress(0, file.name, [{ name: file.name, status: 'in-progress' }]);

    try {
        const zip = await JSZip.loadAsync(file, {
            // 진행률 콜백
        });

        updateProgress(30, '파일 분석 중...', [{ name: file.name, status: 'completed' }]);

        const entries = Object.keys(zip.files);
        const totalEntries = entries.filter(name => !zip.files[name].dir).length;
        const fileStatuses = entries
            .filter(name => !zip.files[name].dir)
            .map(name => ({ name, status: 'waiting' }));

        state.extractedData = [];
        let processed = 0;

        for (const fileName of entries) {
            if (state.cancelled) return goHome();

            const zipEntry = zip.files[fileName];
            if (zipEntry.dir) continue;

            const statusIdx = fileStatuses.findIndex(f => f.name === fileName);
            if (statusIdx >= 0) fileStatuses[statusIdx].status = 'in-progress';
            updateProgress(30 + (processed / totalEntries) * 65, fileName, fileStatuses);

            const blob = await zipEntry.async('blob');
            state.extractedData.push({
                name: fileName,
                blob: blob,
                size: blob.size
            });

            if (statusIdx >= 0) fileStatuses[statusIdx].status = 'completed';
            processed++;
            updateProgress(30 + (processed / totalEntries) * 65, fileName, fileStatuses);
        }

        updateProgress(100, '완료!', fileStatuses);

        // 완료 화면 표시
        showExtractComplete(file.name);
    } catch (err) {
        console.error('압축 해제 오류:', err);
        alert('압축 해제 중 오류가 발생했습니다. 올바른 ZIP 파일인지 확인해주세요.');
        goHome();
    }
}

// === 폴더에 파일들 저장 (File System Access API) ===
async function saveFilesToFolder(files) {
    if (!window.showDirectoryPicker) {
        alert('이 브라우저는 폴더 선택을 지원하지 않습니다.\nChrome 또는 Edge 브라우저를 사용해주세요.');
        return false;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        for (const file of files) {
            // 하위 폴더 경로 처리
            const parts = file.name.split('/');
            let currentDir = dirHandle;
            for (let i = 0; i < parts.length - 1; i++) {
                currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
            }
            const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file.blob);
            await writable.close();
        }
        return true;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('폴더 저장 오류:', err);
            alert('파일 저장 중 오류가 발생했습니다: ' + err.message);
        }
        return false;
    }
}

// === 압축 해제 완료 화면 ===
function showExtractComplete(originalName) {
    showScreen('screenComplete');

    completeTitle.textContent = '압축 해제 완료!';
    completeSubtitle.textContent = '저장할 폴더를 선택해주세요';

    statsRow.style.display = 'none';

    outputFileName.textContent = originalName;
    outputFileCount.textContent = state.extractedData.length + '개 파일 추출됨';

    // 추출된 파일 목록 표시
    extractedFiles.style.display = 'block';
    extractedList.innerHTML = '';

    state.extractedData.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'extracted-item';
        item.innerHTML = `
            <div class="extracted-item-name">
                <span>${getFileIcon(file.name)}</span>
                <span>${file.name}</span>
            </div>
            <span class="extracted-item-size">${formatSize(file.size)}</span>
        `;
        extractedList.appendChild(item);
    });

    // 폴더 선택해서 저장 버튼
    downloadBtn.style.display = '';
    downloadBtn.textContent = '📁 저장할 폴더 선택';
    downloadBtn.onclick = async () => {
        const saved = await saveFilesToFolder(state.extractedData);
        if (saved) {
            completeSubtitle.textContent = '모든 파일이 선택한 폴더에 저장되었습니다';
            downloadBtn.style.display = 'none';
        }
    };
}

// === 홈으로 돌아가기 ===
function goHome() {
    state.compressFiles = [];
    state.extractedData = null;
    state.compressedBlob = null;
    state.originalSize = 0;
    state.compressedSize = 0;
    state.cancelled = false;
    state.saveFileHandle = null;

    compressFileList.innerHTML = '';
    compressOptions.style.display = 'none';
    saveLocationText.textContent = '위치 선택하기';
    saveLocationHint.textContent = '기본: 다운로드 폴더';
    saveLocationHint.style.color = '';
    progressFileList.innerHTML = '';
    progressBarFill.style.width = '0%';
    progressRing.style.strokeDashoffset = 502.4;
    progressPercent.textContent = '0%';
    zipFileNameInput.value = 'my_files';

    showScreen('screenHome');
}

// === 이벤트 리스너 초기화 ===
function init() {
    // 압축 드롭존
    setupDropZone(compressDropZone, compressFileInput, (files) => {
        addCompressFiles(files);
    });

    // 해제 드롭존
    setupDropZone(extractDropZone, extractFileInput, (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.zip')) {
                extractFile(file);
            } else {
                alert('ZIP 파일만 지원합니다. (.zip)');
            }
        }
    });

    // 저장 위치 선택 버튼
    chooseSaveLocationBtn.addEventListener('click', chooseSaveLocation);

    // 압축 시작 버튼
    startCompressBtn.addEventListener('click', compressFiles);

    // 취소 버튼
    cancelBtn.addEventListener('click', () => {
        state.cancelled = true;
    });

    // 새 작업 버튼
    newTaskBtn.addEventListener('click', goHome);

    // 로고 클릭 → 홈
    logo.addEventListener('click', goHome);

    // 초기 프로그레스 링 설정
    const circumference = 2 * Math.PI * 80;
    progressRing.style.strokeDasharray = circumference;
    progressRing.style.strokeDashoffset = circumference;
}

// === DOM Ready ===
document.addEventListener('DOMContentLoaded', init);
