<script setup lang="ts">
    import { inject, type Ref } from 'vue';

    const unreadRecord = inject('unreadRecord') as Ref<string[]>;
    const scrollItemIntoView = inject('scrollItemIntoView') as (messageId: string) => void;
</script>

<template>
    <vscode-button @click="scrollItemIntoView(unreadRecord[0]);" appearance="secondary" v-show="unreadRecord.length>0">
        <inline>New Messages</inline>
        &nbsp;
        <vscode-badge>{{unreadRecord.length}}</vscode-badge>
    </vscode-button>
</template>

<style scoped>
    vscode-button {
        border-radius: 4px;
        width: 100%;
        margin-bottom: 4px;
    }
</style>