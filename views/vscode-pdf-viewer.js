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
                    break;
                default:
                    break;
            }
        });

        // Display Error Message
        window.onerror = () => {
            const msg = document.createElement('body');
            msg.innerText = 'An error occurred while loading the file. Please open it again.';
            document.body = msg;
        };
    }, { once : true });

}());
