<script setup lang="ts">
    import { computed, onMounted } from 'vue';
    import { TextField } from '@vscode/webview-ui-toolkit';
    import { sendMessage } from '../utils';

    const isTextFieldEmpty = computed(() => {
        const textField = document.querySelector('vscode-text-field') as TextField;
        return !textField.value;
    });

    function handleMessage() {}
</script>

<template>
    <vscode-text-field autofocus placeholder="Send a message to your collaborators...">
        <section slot="end" style="display:flex; align-items: center;">
            <vscode-button :disabled="isTextFieldEmpty" @click="handleMessage" appearance="icon" aria-label="Send Message">
                <span class="codicon codicon-send"></span>
            </vscode-button>
        </section>
    </vscode-text-field>
</template>

<style scoped>
    vscode-text-field {
        width: 100%;
    }
</style>