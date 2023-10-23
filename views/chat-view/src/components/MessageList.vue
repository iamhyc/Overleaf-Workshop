<script setup lang="ts">
    import { ref, watchEffect } from 'vue';
    import { type Message } from '../utils';
    import MessageItem from './MessageItem.vue';

    const props = defineProps<{
        messages: Message[],
    }>();
    const messageContainer = ref<HTMLDivElement>();

    // update the timestamp every 10 seconds
    const now = ref(Date.now());
    setInterval(() => {
        now.value = Date.now();
    }, 10*1000);

    // (triggered once) scroll to the bottom of the message list
    watchEffect(() => {
        if (messageContainer.value) {
            messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
        }
    });
</script>

<template>
    <div v-if="messages.length === 0" class="empty-container">
        <span>No messages yet</span>
    </div>
    <div v-else class="message-container" ref="messageContainer">
        <template v-for="message in messages" :key="message.id">
            <vscode-divider role="separator"></vscode-divider>
            <MessageItem :message="message" :now="now" />
            <MessageItem v-if="message.replies" v-for="reply in message.replies" class="indent" :key="reply.id" :root="message" :message="reply" :now="now" />
        </template>
    </div>
</template>

<style scoped>
    .empty-container, .message-container {
        width: 100%;
        margin-bottom: 10px;
    }

    .empty-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: var(--vscode-descriptionForeground);
    }

    .message-container {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        overflow-y: auto;
        overflow-x: hidden;
    }

    .message-container::-webkit-scrollbar-thumb {
        border-left: 4px solid transparent;
        background-clip: padding-box;
    }

    .indent {
        width: 90%;
    }
</style>