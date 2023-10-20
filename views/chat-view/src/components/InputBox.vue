<script setup lang="ts">
    import { computed, onMounted } from 'vue';
    import { TextArea } from '@vscode/webview-ui-toolkit';
    import { sendMessage } from '../utils';

    const placeholder = 'Send a message to your collaborators...';

    onMounted(() => {
        // adjust the style of the text area
        const textArea = document.querySelector('vscode-text-area') as TextArea;
        const textAreaElement = textArea.control as HTMLTextAreaElement;
        textAreaElement.style.borderRadius = '4px';
        textAreaElement.style.overflow = 'hidden';
    });

    const autoExpand = (event: Event) => {
        const textArea = (event.target as TextArea).control as HTMLTextAreaElement;
        textArea.style.height = 'auto';
        textArea.style.height = textArea.scrollHeight + 'px';
    };

    function handleKeybinding(event: KeyboardEvent) {
        const target = event.target as TextArea;
        if (event.key==='Enter' && !event.shiftKey && !event.ctrlKey) {
            event.preventDefault();
            sendMessage(target.value);
            target.control.value = '';
            autoExpand(event);
        } else if (event.key==='Enter' && (event.ctrlKey || event.shiftKey)) {
            event.preventDefault();
            target.control.value += '\n';
            autoExpand(event);
        }
    }
</script>

<template>
    <vscode-text-area
    @input="autoExpand"
    @keydown="handleKeybinding"
    autofocus resize="none" :placeholder="placeholder">
    </vscode-text-area>
</template>

<style scoped>
    vscode-text-area {
        width: 100%;
        margin-bottom: 10px;
    }
</style>
