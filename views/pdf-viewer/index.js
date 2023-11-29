/* eslint-disable @typescript-eslint/naming-convention */
"use strict";

// Reference: https://github.com/tomoki1207/vscode-pdfviewer/blob/main/lib/main.js
(function(){
    const CursorTool = { SELECT:0, HAND:1, ZOOM:2 };
    const SpreadMode = { UNKNOWN:-1, NONE:0, ODD:1, EVEN:2 };
    const ScrollMode = { UNKNOWN:-1, VERTICAL:0, HORIZONTAL:1, WRAPPED:2, PAGE:3 };
    const SidebarView = { UNKNOWN:-1, NONE:0, THUMBS:1, OUTLINE:2, ATTACHMENTS:3, LAYERS:4 };
    const ColorTheme = {
        'Default': {fontColor:'black', bgColor:'white'},
        'Light': {fontColor:'black', bgColor:'#F5F5DC'},
        'Dark': {fontColor:'#FBF0D9', bgColor:'#4B4B4B'}
    };

    // @ts-ignore
    const vscode = acquireVsCodeApi();
    let globalPdfViewerState = {
        colorTheme: 'Default',
        containerScrollLeft: 0,
        containerScrollTop:  0,
        currentScaleValue: 'auto',
        pdfCursorTools: CursorTool.SELECT,
        pdfViewerScrollMode: ScrollMode.VERTICAL,
        pdfViewerSpreadMode: SpreadMode.NONE,
        pdfSidebarView: SidebarView.NONE,
    };
    let firstLoaded = true;

    function updatePdfViewerState() {
        const pdfViewerState = vscode.getState() || globalPdfViewerState;
        pdfjsLib.ViewerFontColor = ColorTheme[pdfViewerState.colorTheme].fontColor;
        pdfjsLib.ViewerBgColor = ColorTheme[pdfViewerState.colorTheme].bgColor;
        PDFViewerApplication.pdfViewer.currentScaleValue = pdfViewerState.currentScaleValue;
        PDFViewerApplication.pdfCursorTools.switchTool( pdfViewerState.pdfCursorTools );
        PDFViewerApplication.pdfViewer.scrollMode = pdfViewerState.pdfViewerScrollMode;
        PDFViewerApplication.pdfViewer.spreadMode = pdfViewerState.pdfViewerSpreadMode;
        PDFViewerApplication.pdfSidebar.setInitialView( pdfViewerState.pdfSidebarView );
        PDFViewerApplication.pdfSidebar.switchView( pdfViewerState.pdfSidebarView );
        document.getElementById('viewerContainer').scrollLeft = pdfViewerState.containerScrollLeft;
        document.getElementById('viewerContainer').scrollTop = pdfViewerState.containerScrollTop;
        PDFViewerApplication.pdfViewer.refresh();
    }

    function backupPdfViewerState() {
        if (PDFViewerApplication.pdfViewer.currentScaleValue !== null) {
            console.log( PDFViewerApplication.pdfViewer.currentScaleValue );
            globalPdfViewerState.currentScaleValue = PDFViewerApplication.pdfViewer.currentScaleValue;
        }
        globalPdfViewerState.pdfViewerScrollMode = PDFViewerApplication.pdfViewer.scrollMode;
        globalPdfViewerState.pdfViewerSpreadMode = PDFViewerApplication.pdfViewer.spreadMode;
        globalPdfViewerState.pdfSidebarView = PDFViewerApplication.pdfSidebar.visibleView;
        globalPdfViewerState.containerScrollLeft = document.getElementById('viewerContainer').scrollLeft || 0;
        globalPdfViewerState.containerScrollTop = document.getElementById('viewerContainer').scrollTop || 0;
        vscode.setState(globalPdfViewerState);
        vscode.postMessage({
            type: 'saveState',
            content: globalPdfViewerState,
        });
    }

    function enableThemeToggleButton(initIndex = 0){
        // create toggle theme button
        const button = document.createElement('button');
        button.setAttribute('class', 'toolbarButton hiddenMediumView');
        button.setAttribute('theme-index', initIndex);
        button.setAttribute('tabindex', '30');
        // set button theme attribute
        const setAttribute = (index) => {
            const theme = Object.keys(ColorTheme)[index];
            globalPdfViewerState.colorTheme = theme;
            button.innerHTML = `<span>${theme}</span>`;
            button.setAttribute('title', `Theme: ${theme}`);
            button.setAttribute('id', `theme-${theme}`);
        };
        button.addEventListener('click', () => {
            const index = Number(button.getAttribute('theme-index'));
            const next = (index + 1) % Object.keys(ColorTheme).length;
            button.setAttribute('theme-index', next);
            setAttribute(next);
            backupPdfViewerState();
            updatePdfViewerState();
        });
        setAttribute(initIndex);
        //
        const container = document.getElementById('toolbarViewerRight');
        const firstChild = document.getElementById('openFile');
        container.insertBefore(button, firstChild);
    }

    async function updatePdf(pdf) {
        const doc = await pdfjsLib.getDocument({
            data: pdf,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.10.111/cmaps/',
            cMapPacked: true
        }).promise;
        if (firstLoaded) {
            firstLoaded = false;
        } else {
            backupPdfViewerState();
        }
        PDFViewerApplication.load(doc);
    }

    // Reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/viewer/latexworkshop.ts#L306
    function syncCode(pdf) {
        const _idx = Math.ceil(pdf.length / 2) - 1;
        const container = document.getElementById('viewerContainer');
        const maxScrollX = window.innerWidth * 0.9;
        const minScrollX = window.innerWidth * 0.1;
        const pageNum = pdf[_idx].page;
        const h = pdf[_idx].h;
        const v = pdf[_idx].v;
        const page = document.getElementsByClassName('page')[pageNum - 1];
        if (page === null || page === undefined) {
            return;
        }
        const {viewport} = PDFViewerApplication.pdfViewer.getPageView(pageNum - 1);
        let [left, top] = viewport.convertToPdfPoint(h , v);
        let scrollX = page.offsetLeft + left;
        scrollX = Math.min(scrollX, maxScrollX);
        scrollX = Math.max(scrollX, minScrollX);
        const scrollY = page.offsetTop + page.offsetHeight - top;
        if (PDFViewerApplication.pdfViewer.scrollMode === 1) {
            // horizontal scrolling
            container.scrollLeft = page.offsetLeft;
        } else {
            // vertical scrolling
            container.scrollTop = scrollY - document.body.offsetHeight * 0.4;
        }
        backupPdfViewerState();
    }

    //Reference: https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/pdf-preview/util/pdf-js-wrapper.js#L163
    function syncPdf(pageElem, pageNum, clientX, clientY, innerText) {
        const pageCanvas = pageElem.querySelector('canvas');
        const pageRect = pageCanvas.getBoundingClientRect();
        const {viewport} = PDFViewerApplication.pdfViewer.getPageView(pageNum - 1);
        const dx = clientX - pageRect.left;
        const dy = clientY - pageRect.top;
        let [left, top] = viewport.convertToPdfPoint(dx, dy);
        top = viewport.viewBox[3] - top;
        vscode.postMessage({
            type: 'syncPdf',
            content: { page: Number(pageNum), h: left, v: top, identifier: innerText},
        });
        backupPdfViewerState();
    }

    window.addEventListener('load', async () => {
        // init pdf.js configuration
        PDFViewerApplication.initializedPromise
        .then(() => {
            const {eventBus, _boundEvents} = PDFViewerApplication;
            eventBus._off("beforeprint", _boundEvents.beforePrint);
            eventBus.on('documentloaded', updatePdfViewerState);
            // backup scale
            eventBus._on('scalechanged', backupPdfViewerState);
            eventBus._on("zoomin", backupPdfViewerState);
            eventBus._on("zoomout", backupPdfViewerState);
            eventBus._on("zoomreset", backupPdfViewerState);
            // backup scroll/spread mode
            eventBus._on("switchscrollmode", backupPdfViewerState);
            eventBus._on("scrollmodechanged", backupPdfViewerState);
            eventBus._on("switchspreadmode", backupPdfViewerState);
            vscode.postMessage({type: 'ready'});
        });

        // add message listener
        window.addEventListener('message', async (e) => {
            const message = e.data;
            switch (message.type) {
                case 'update':
                    updatePdf(message.content);
                    break;
                case 'syncCode':
                    syncCode(message.content);
                    break;
                case 'initState':
                    if (message.content!==undefined) {
                        Object.assign(globalPdfViewerState, message.content);
                    }
                    updatePdfViewerState();
                    enableThemeToggleButton( Object.keys(ColorTheme).indexOf(globalPdfViewerState.colorTheme) );
                    break;
                default:
                    break;
            }
        });

        // add mouse double click listener
        window.addEventListener('dblclick', (e) => {
            const pageElem = e.target.parentElement.parentElement;
            const pageNum = pageElem.getAttribute('data-page-number');
            if (pageNum === null || pageNum === undefined) {
                return;
            }
            syncPdf(pageElem, pageNum, e.clientX, e.clientY, e.target.innerText);
        });

        // Display Error Message
        window.onerror = () => {
            const msg = document.createElement('body');
            msg.innerText = 'An error occurred while loading the file. Please open it again.';
            document.body = msg;
        };
    }, { once : true });

}());
