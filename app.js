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
    saveDirHandle: null,     // 압축 저장 핸들
    extractZipFile: null,    // 해제할 ZIP 파일
    extractZipObj: null,     // JSZip 객체
    extractDirHandle: null,  // 해제 저장 폴더
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
const extractPreview = $('#extractPreview');
const extractZipName = $('#extractZipName');
const extractFileListEl = $('#extractFileList');
const startExtractBtn = $('#startExtract');
const extractClearBtn = $('#extractClear');

// Progress
const progressTitle = $('#progressTitle');
const overallLabel = $('#overallLabel');
const overallPercent = $('#overallPercent');
const progressFileList = $('#progressFileList');
const progressBarFill = $('#progressBarFill');
const zipGenSection = $('#zipGenSection');
const zipGenLabel = $('#zipGenLabel');
const zipGenPercent = $('#zipGenPercent');
const zipGenBarFill = $('#zipGenBarFill');
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

// === 파일 목록 렌더링 (진행 화면) ===
function renderProgressFileList(fileStatuses) {
    progressFileList.innerHTML = '';
    fileStatuses.forEach(fs => {
        const item = document.createElement('div');
        item.className = `progress-file-item ${fs.status}`;

        const percent = fs.status === 'completed' ? 100 :
            fs.status === 'in-progress' ? Math.round((fs.progress || 0) * 100) :
            fs.status === 'compressing' ? Math.round((fs.progress || 0) * 100) : 0;

        const statusIcon = fs.status === 'completed' ? '✓' :
            (fs.status === 'in-progress' || fs.status === 'compressing') ? '⟳' : '○';

        const statusClass = fs.status === 'compressing' ? 'in-progress' : fs.status;

        item.className = `progress-file-item ${statusClass}`;

        item.innerHTML = `
            <div class="pf-top">
                <span class="pf-status">${statusIcon}</span>
                <span class="pf-name">${fs.name}</span>
                <span class="pf-size">${formatSize(fs.size)}</span>
                ${fs.status !== 'waiting' && fs.status !== 'completed' ? `<span class="pf-percent">${percent}%</span>` : ''}
            </div>
            ${fs.status !== 'waiting' ? `<div class="pf-bar"><div class="pf-bar-fill" style="width:${percent}%"></div></div>` : ''}
        `;
        progressFileList.appendChild(item);
    });
}

// === 전체 진행률 업데이트 ===
function updateOverallProgress(percent, label) {
    const p = Math.min(Math.round(percent), 100);
    progressBarFill.style.width = p + '%';
    overallPercent.textContent = p + '%';
    if (label) overallLabel.textContent = label;
}

// === ZIP 생성 진행률 업데이트 ===
function updateZipGenProgress(percent) {
    const p = Math.min(Math.round(percent), 100);
    zipGenBarFill.style.width = p + '%';
    zipGenPercent.textContent = p + '%';
}

// === 용량 제한 체크 (4GB) ===
const MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

function checkSizeLimit() {
    const totalSize = state.compressFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_SIZE) {
        alert(t('sizeLimitError').replace('{size}', formatSize(totalSize)));
        return false;
    }
    return true;
}

// === 압축 실행 ===
async function compressFiles() {
    if (state.compressFiles.length === 0) return;
    if (!checkSizeLimit()) return;

    state.mode = 'compress';
    state.cancelled = false;
    state.originalSize = state.compressFiles.reduce((sum, f) => sum + f.size, 0);

    showScreen('screenProgress');
    progressTitle.textContent = t('compressing');
    zipGenSection.style.display = 'none';

    const zip = new JSZip();
    const totalFiles = state.compressFiles.length;
    const fileStatuses = state.compressFiles.map(f => ({
        name: f.name,
        size: f.size,
        status: 'waiting',
        progress: 0
    }));

    renderProgressFileList(fileStatuses);
    updateOverallProgress(0, `0 / ${totalFiles} ${t('filesUnit')}`);

    try {
        // === 1단계: 파일 읽기 (전체의 40%) ===
        for (let i = 0; i < totalFiles; i++) {
            if (state.cancelled) return goHome();

            const file = state.compressFiles[i];
            fileStatuses[i].status = 'in-progress';
            fileStatuses[i].progress = 0;
            renderProgressFileList(fileStatuses);
            await yieldToUI();

            try {
                const data = await readFileAsync(file, (readProgress) => {
                    fileStatuses[i].progress = readProgress * 0.5;
                    renderProgressFileList(fileStatuses);
                    const overallP = ((i + readProgress) / totalFiles) * 40;
                    updateOverallProgress(overallP, `${t('processingFile')} ${file.name} (${formatSize(file.size)})`);
                });
                zip.file(file.name, data);
            } catch (readErr) {
                console.error(`파일 읽기 오류 (${file.name}):`, readErr);
                fileStatuses[i].status = 'completed';
                fileStatuses[i].progress = 1;
                renderProgressFileList(fileStatuses);
                continue;
            }

            // 읽기 완료 → 50%로 표시 (압축 대기 상태)
            fileStatuses[i].status = 'waiting';
            fileStatuses[i].progress = 0.5;
            const overallP = ((i + 1) / totalFiles) * 40;
            updateOverallProgress(overallP, `${i + 1} / ${totalFiles} ${t('filesUnit')}`);
            renderProgressFileList(fileStatuses);
            await yieldToUI();
        }

        if (state.cancelled) return goHome();

        // === 2단계: ZIP 압축 (전체의 60%) ===
        updateOverallProgress(40, t('generatingZip'));
        zipGenSection.style.display = 'block';
        zipGenLabel.textContent = t('generating');
        updateZipGenProgress(0);

        // 모든 파일을 "압축 대기" 상태로
        fileStatuses.forEach(fs => {
            if (fs.status !== 'completed') {
                fs.status = 'waiting';
                fs.progress = 0.5;
            }
        });
        renderProgressFileList(fileStatuses);

        let lastFile = '';
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (metadata) => {
            // 현재 압축 중인 파일 업데이트
            if (metadata.currentFile && metadata.currentFile !== lastFile) {
                // 이전 파일 완료 처리
                if (lastFile) {
                    const prevIdx = fileStatuses.findIndex(f => f.name === lastFile);
                    if (prevIdx >= 0) {
                        fileStatuses[prevIdx].status = 'completed';
                        fileStatuses[prevIdx].progress = 1;
                    }
                }
                // 현재 파일 압축 중
                const curIdx = fileStatuses.findIndex(f => f.name === metadata.currentFile);
                if (curIdx >= 0) {
                    fileStatuses[curIdx].status = 'compressing';
                    fileStatuses[curIdx].progress = 0.5;
                }
                lastFile = metadata.currentFile;
                renderProgressFileList(fileStatuses);
            }

            // 현재 파일 개별 진행률 업데이트
            if (metadata.currentFile) {
                const curIdx = fileStatuses.findIndex(f => f.name === metadata.currentFile);
                if (curIdx >= 0 && fileStatuses[curIdx].status === 'compressing') {
                    fileStatuses[curIdx].progress = 0.5 + (metadata.percent / 100) * 0.5;
                }
            }

            updateZipGenProgress(metadata.percent);
            const overallP = 40 + (metadata.percent / 100) * 60;
            updateOverallProgress(overallP, `${t('generating')} ${Math.round(metadata.percent)}%`);
            renderProgressFileList(fileStatuses);
        });

        // 마지막 파일 완료
        if (lastFile) {
            const lastIdx = fileStatuses.findIndex(f => f.name === lastFile);
            if (lastIdx >= 0) {
                fileStatuses[lastIdx].status = 'completed';
                fileStatuses[lastIdx].progress = 1;
            }
        }
        fileStatuses.forEach(fs => { fs.status = 'completed'; fs.progress = 1; });
        renderProgressFileList(fileStatuses);

        if (state.cancelled) return goHome();

        state.compressedBlob = blob;
        state.compressedSize = blob.size;

        showCompressComplete();
    } catch (err) {
        console.error('압축 오류:', err);
        alert(t('compressError') + ' ' + err.message);
        goHome();
    }
}

// === 파일 비동기 읽기 (진행률 포함) ===
function readFileAsync(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        if (onProgress) {
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    onProgress(e.loaded / e.total);
                }
            };
        }
        reader.readAsArrayBuffer(file);
    });
}

// === 압축 완료 → 저장 대화상자 표시 후 결과 화면 ===
async function showCompressComplete() {
    const fileName = (zipFileNameInput.value || 'my_files') + '.zip';

    // 저장 대화상자 표시 (바탕화면 포함 어디든 저장 가능)
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(state.compressedBlob);
            await writable.close();
        } catch (err) {
            if (err.name !== 'AbortError') {
                saveAs(state.compressedBlob, fileName);
            }
        }
    } else {
        saveAs(state.compressedBlob, fileName);
    }

    // 결과 화면 표시
    showScreen('screenComplete');

    const savedPercent = ((1 - state.compressedSize / state.originalSize) * 100).toFixed(1);

    completeTitle.textContent = t('compressComplete');
    completeSubtitle.textContent = t('compressSavedAuto');

    statsRow.style.display = 'grid';
    statOriginal.textContent = formatSize(state.originalSize);
    statCompressed.textContent = formatSize(state.compressedSize);
    statSaved.textContent = savedPercent + '%';

    outputFileName.textContent = fileName;
    outputFileCount.textContent = state.compressFiles.length + t('filesUnit');

    extractedFiles.style.display = 'none';
    downloadBtn.style.display = 'none';
}

// === ZIP 파일 미리보기 (드롭 시 호출) ===
async function previewZipFile(file) {
    try {
        const zip = await JSZip.loadAsync(file);
        state.extractZipFile = file;
        state.extractZipObj = zip;

        // 드롭존 숨기고 미리보기 표시
        extractDropZone.style.display = 'none';
        extractPreview.style.display = 'block';
        extractZipName.textContent = `📦 ${file.name} (${formatSize(file.size)})`;

        // 파일 목록 표시
        const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        extractFileListEl.innerHTML = '';
        entries.forEach(name => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <div class="file-item-info">
                    <span class="file-item-icon">${getFileIcon(name)}</span>
                    <span class="file-item-name">${name}</span>
                </div>
            `;
            extractFileListEl.appendChild(item);
        });
    } catch (err) {
        console.error('ZIP 읽기 오류:', err);
        alert(t('extractError'));
    }
}

// === 압축 해제 저장: 다운로드 폴더 자동 저장 (시스템 폴더 제한으로 폴더 선택 제거) ===

// === 압축 해제 초기화 ===
function clearExtractPreview() {
    state.extractZipFile = null;
    state.extractZipObj = null;
    state.extractDirHandle = null;
    extractDropZone.style.display = '';
    extractPreview.style.display = 'none';
    extractFileListEl.innerHTML = '';
}

// === 압축 해제 실행 ===
async function startExtraction() {
    if (!state.extractZipObj) return;

    const file = state.extractZipFile;
    const zip = state.extractZipObj;

    state.mode = 'extract';
    state.cancelled = false;
    state.originalSize = file.size;

    showScreen('screenProgress');
    progressTitle.textContent = t('extracting');
    zipGenSection.style.display = 'none';
    updateOverallProgress(0, t('processing'));

    const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const totalEntries = entries.length;
    const fileStatuses = entries.map(name => ({ name, size: 0, status: 'waiting', readProgress: 0 }));
    renderProgressFileList(fileStatuses);

    state.extractedData = [];
    let processed = 0;

    try {
        for (const fileName of entries) {
            if (state.cancelled) return goHome();

            const zipEntry = zip.files[fileName];
            const statusIdx = fileStatuses.findIndex(f => f.name === fileName);
            if (statusIdx >= 0) {
                fileStatuses[statusIdx].status = 'in-progress';
                renderProgressFileList(fileStatuses);
            }
            updateOverallProgress((processed / totalEntries) * 100, `${t('processingFile')} ${fileName}`);

            const blob = await zipEntry.async('blob');
            state.extractedData.push({ name: fileName, blob, size: blob.size });

            if (statusIdx >= 0) {
                fileStatuses[statusIdx].status = 'completed';
                fileStatuses[statusIdx].size = blob.size;
                fileStatuses[statusIdx].readProgress = 1;
            }
            processed++;
            updateOverallProgress((processed / totalEntries) * 100, `${processed} / ${totalEntries} ${t('filesUnit')}`);
            renderProgressFileList(fileStatuses);
            await yieldToUI();
        }

        updateOverallProgress(100, t('done'));

        // 다운로드 폴더에 자동 저장
        state.extractedData.forEach(f => saveAs(f.blob, f.name));
        showExtractComplete(file.name, null);
    } catch (err) {
        console.error('압축 해제 오류:', err);
        alert(t('extractError'));
        goHome();
    }
}

// === 압축 해제 완료 화면 ===
function showExtractComplete(originalName, savedPath) {
    showScreen('screenComplete');

    completeTitle.textContent = t('extractComplete');
    completeSubtitle.textContent = savedPath
        ? t('savedToFolder').replace('{folder}', savedPath)
        : t('savedToDownloads');

    statsRow.style.display = 'none';
    outputFileName.textContent = originalName;
    outputFileCount.textContent = state.extractedData.length + t('extractedCount');

    // 추출된 파일 목록
    extractedFiles.style.display = 'block';
    extractedList.innerHTML = '';
    state.extractedData.forEach((file) => {
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

    downloadBtn.style.display = 'none';
}

// === 홈으로 돌아가기 ===
function goHome() {
    state.compressFiles = [];
    state.extractedData = null;
    state.compressedBlob = null;
    state.originalSize = 0;
    state.compressedSize = 0;
    state.cancelled = false;
    state.saveDirHandle = null;

    compressFileList.innerHTML = '';
    compressOptions.style.display = 'none';
    clearExtractPreview();
    progressFileList.innerHTML = '';
    progressBarFill.style.width = '0%';
    overallPercent.textContent = '0%';
    zipGenSection.style.display = 'none';
    zipFileNameInput.value = 'my_files';

    showScreen('screenHome');
}

// === 이벤트 리스너 초기화 ===
function init() {
    // 압축 드롭존
    setupDropZone(compressDropZone, compressFileInput, (files) => {
        addCompressFiles(files);
    });

    // 해제 드롭존 → 미리보기
    setupDropZone(extractDropZone, extractFileInput, (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.zip')) {
                previewZipFile(file);
            } else {
                alert(t('zipOnly'));
            }
        }
    });

    // 해제 시작 버튼
    startExtractBtn.addEventListener('click', startExtraction);

    // 해제 미리보기 초기화
    extractClearBtn.addEventListener('click', clearExtractPreview);

    // 저장 폴더 선택 버튼
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

    // 다국어 초기화
    initI18n();
}

// === DOM Ready ===
document.addEventListener('DOMContentLoaded', init);
