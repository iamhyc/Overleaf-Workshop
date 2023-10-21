<script setup lang="ts">
    import { ref, onMounted, computed } from 'vue';
    import { TextArea } from '@vscode/webview-ui-toolkit';
    import { sendMessage } from '../utils';

    const props = defineProps<{
        context?: string,
        placeholder?: string,
    }>();
    const textAreaRef = ref<TextArea>();
    const placeholder = computed(() => {
        return props.placeholder || 'Send a message to your collaborators...';
    })

    onMounted(() => {
        if (!textAreaRef.value) { return; }
        const textAreaElement = textAreaRef.value.control as HTMLTextAreaElement;
        // adjust the style of the text area
        textAreaElement.style.borderRadius = '4px';
        textAreaElement.style.overflow = 'hidden';
    });

    function autoExpand() {
        if (!textAreaRef.value) { return; }
        const textAreaElement = textAreaRef.value.control as HTMLTextAreaElement;
        // reset height to 0 so that it can shrink
        textAreaElement.style.height = 'auto';
        textAreaElement.style.height = textAreaElement.scrollHeight + 'px';
    };

    function handleKeybinding(event: KeyboardEvent) {
        const target = event.target as TextArea;
        if (event.key==='Enter' && !event.shiftKey && !event.ctrlKey) {
            event.preventDefault();
            sendMessage(target.value, props.context);
            target.control.value = '';
            autoExpand();
        } else if (event.key==='Enter' && (event.ctrlKey || event.shiftKey)) {
            event.preventDefault();
            target.control.value += '\n';
            autoExpand();
        }
    }
</script>

<template>
    <vscode-text-area
    ref="textAreaRef"
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
