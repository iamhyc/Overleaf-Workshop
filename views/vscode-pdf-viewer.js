/* eslint-disable @typescript-eslint/naming-convention */
"use strict";

// Reference: https://github.com/tomoki1207/vscode-pdfviewer/blob/main/lib/main.js
(function(){
    const CursorTool = {
        SELECT: 0,
        HAND: 1,
        ZOOM: 2
    };
    const SpreadMode = {
        UNKNOWN: -1,
        NONE: 0,
        ODD: 1,
        EVEN: 2
    };
    const ScrollMode = {
        UNKNOWN: -1,
        VERTICAL: 0,
        HORIZONTAL: 1,
        WRAPPED: 2,
        PAGE: 3
    };
    const SidebarView = {
        UNKNOWN: -1,
        NONE: 0,
        THUMBS: 1,
        OUTLINE: 2,
        ATTACHMENTS: 3,
        LAYERS: 4
    };
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    async function updatePdf(pdf) {
        const doc = await pdfjsLib.getDocument(pdf).promise;
        PDFViewerApplication.load(doc);
    }

    window.addEventListener('load', async () => {
        // init pdf.js configuration
        PDFViewerApplication.initializedPromise
        .then(() => {
            const optsOnLoad = () => {
                PDFViewerApplication.pdfViewer.currentScaleValue = 1.0;
                PDFViewerApplication.pdfCursorTools.switchTool( CursorTool.SELECT );
                PDFViewerApplication.pdfViewer.scrollMode = ScrollMode.VERTICAL;
                PDFViewerApplication.pdfViewer.spreadMode = SpreadMode.NONE;
                PDFViewerApplication.pdfSidebar.switchView( SidebarView.NONE );
                PDFViewerApplication.eventBus.off('documentloaded', optsOnLoad);
            };
            PDFViewerApplication.eventBus.on('documentloaded', optsOnLoad);
        });

        // add message listener
        window.addEventListener('message', async (e) => {
            const message = e.data;
            switch (message.type) {
                case 'update':
                    updatePdf(message.content);
                case 'syncCode':
                    // Reference: https://github.com/James-Yu/LaTeX-Workshop/blob/master/viewer/latexworkshop.ts#L306
                    const _idx = Math.round(message.content.length / 2);
                    const container = document.getElementById('viewerContainer');
                    const maxScrollX = window.innerWidth * 0.9;
                    const minScrollX = window.innerWidth * 0.1;
                    const pageNum = message.content[_idx].page;
                    const h = message.content[_idx].h;
                    const v = message.content[_idx].v;
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
            //Reference: https://github.com/overleaf/overleaf/blob/main/services/web/frontend/js/features/pdf-preview/util/pdf-js-wrapper.js#L163
            const pageCanvas = pageElem.querySelector('canvas');
            const pageRect = pageCanvas.getBoundingClientRect();
            const {viewport} = PDFViewerApplication.pdfViewer.getPageView(pageNum - 1);
            const dx = e.clientX - pageRect.left;
            const dy = e.clientY - pageRect.top;
            let [left, top] = viewport.convertToPdfPoint(dx, dy);
            top = viewport.viewBox[3] - top;
            vscode.postMessage({
                type: 'syncPdf',
                content: { page: Number(pageNum), h: left, v: top, identifier: e.target.innerText},
            });
        });

        // Display Error Message
        window.onerror = () => {
            const msg = document.createElement('body');
            msg.innerText = 'An error occurred while loading the file. Please open it again.';
            document.body = msg;
        };
    }, { once : true });

}());
