(function(){
    // @ts-ignore
	const vscode = acquireVsCodeApi();
    const container = document.getElementById("viewContainer");
    const eventBus = new pdfjsViewer.EventBus();
    const pdfViewer = new pdfjsViewer.PDFViewer({
        container,
        eventBus,
    });

    eventBus.on('pagesinit', () => {
        pdfViewer.currentScaleValue = 'page-width';
    });

    function updatePdf(pdf) {
        pdfjsLib.getDocument(pdf).promise
        .then((pdfDocument) => {
            pdfViewer.setDocument(pdfDocument);
        });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                updatePdf(message.content);
            case 'syncCode':
                break;
            default:
                break;
        }
    });
}());