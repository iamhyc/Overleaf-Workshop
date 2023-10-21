<script setup lang="ts">
    import { computed, ref } from 'vue';
    import InputBox from './InputBox.vue';
    import { type Message, elapsedTime } from '../utils';
    import * as markdownit from 'markdown-it';
    const md = new markdownit.default();

    const vFocus = {
        mounted: (el:any) => el.focus()
    };

    const props = defineProps<{
        now: number,
        message: Message,
    }>();
    const showReply = ref(false);

    const username = computed(() => {
        return `${props.message.user.first_name} ${props.message.user.last_name}`;
    });
    const formatTimestamp = computed(() => {
        return `${elapsedTime(props.message.timestamp, props.now)} ago`;
    });
</script>

<template>
    <div class="message-item">
        <div class="message-item_header">
            <span class="message-item_header_author">{{ username }}</span>
            <span class="message-item_header_date" :title="new Date(message.timestamp).toLocaleString()">{{ formatTimestamp }}</span>
        </div>
        <div class="message-item_content" v-html="md.render(message.content)"></div>
        <div class="message-item_actions">
            <vscode-button @click="showReply=!showReply" appearance="icon" aria-label="Reply">
                <span class="codicon codicon-comment"></span>
                &nbsp;
                Reply
            </vscode-button>
        </div>
        <InputBox
            v-focus v-if="showReply"
            @keydown.escape.exact="showReply=false"
            :context="`> ${message.id}`" :placeholder="`Reply to @${username}`"
        />
    </div>
</template>

<style scoped>
    .message-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
    }

    .message-item .message-item_header {
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
    }

    .message-item .message-item_header .message-item_header_author {
        font-weight: bold;
        margin-right: 0.5rem;
    }

    .message-item .message-item_header .message-item_header_date {
        font-size: 0.8rem;
        color: var(--vscode-textSecondary);
    }

    .message-item .message-item_content {
        margin: 0;
        width: 100%;
    }

    .message-item .message-item_actions {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        width: 100%;
        color: var(--vscode-textSecondary);
    }
</style>