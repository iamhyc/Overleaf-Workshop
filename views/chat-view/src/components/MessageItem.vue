<script setup lang="ts">
    import { useElementVisibility } from '@vueuse/core'
    import { computed, inject, ref, type Ref, watchEffect } from 'vue';
    import InputBox from './InputBox.vue';
    import { type Message, elapsedTime, getReplyContext, showLineRef } from '../utils';
    import * as markdownit from 'markdown-it';
    const md = new markdownit.default();

    const vFocus = {
        mounted: (el:any) => el.focus()
    };

    const props = defineProps<{
        now: number,
        message: Message,
        root?: Message,
    }>();
    const isFocused = ref(false);
    const container = ref<HTMLDivElement>();
    const showReply = ref(false);
    const hoverButton = ref('');
    const activeInputBox = inject('activeInputBox');
    const unreadRecord = inject('unreadRecord') as Ref<string[]>;

    const username = computed(() => {
        return `${props.message.user.first_name} ${props.message.user.last_name||''}`;
    });
    const formatTimestamp = computed(() => {
        return `${elapsedTime(props.message.timestamp, props.now)} ago`;
    });
    const replyContext = computed(() => {
        return getReplyContext(props.message);
    });
    const parsedContent = computed(() => {
        let content = props.message.content;
        // render markdown content
        content = md.render(content);
        // parse line references
        content = content.replace(/\[\[(([^#]+)#L(\d+)C(\d+)-L(\d+)C(\d+))\]\]/g,
                    `<vscode-link class="show-line-ref" href='$2,$3,$4,$5,$6'>$1</vscode-link>`);
        // parse user reference
        content = content.replace(/@\[\[([^#]+)#([^\]]+)\]\]/g,
                    `<vscode-link href='$1,$2'>@$1</vscode-link>`);
        return content;
    });

    const containerVisible = useElementVisibility(container);
    watchEffect(() => {
        if (containerVisible.value && props.message.newMessage) {
            props.message.newMessage = false;
            const index = unreadRecord.value.indexOf(props.message.id);
            index>=0 && unreadRecord.value.splice(index, 1);
        }
    });

    function insertUsername() {
        const text = `@[[${username.value}#${props.message.user.id}]] `;
        (activeInputBox as Ref<any>).value.value.insertText(text);
    }

    function insertReplyUser() {
        const replyTo = props.message.replyTo;
        const text = `@[[${replyTo?.username}#${replyTo?.userId}]] `;
        (activeInputBox as Ref<any>).value.value.insertText(text);
    }

    function handleClick(event: Event) {
        const target = event.target as HTMLElement;
        if (target.className==='show-line-ref') {
            event.preventDefault();
            const href = target.getAttribute('href')?.split(',') || [];
            const [path, strL1, strC1, strL2, strC2] = href;
            showLineRef(path, parseInt(strL1), parseInt(strC1), parseInt(strL2), parseInt(strC2));
        }
    }

    function scrollIntoView() {
        // scroll container into viewport
        container.value?.scrollIntoView({behavior: 'instant', block: 'nearest'});
        container.value?.classList.add('showup');
        setTimeout(() => {
            container.value?.classList.remove('showup');
        }, 500);
    }

    defineExpose({
        scrollIntoView,
    });
</script>

<template>
    <div class="message-item" ref="container" tabindex="0"
        :aria-label="`${username} said ${formatTimestamp}: ${props.message.content}`"
        :aria-selected="isFocused" @focus="isFocused=true" @focusout="isFocused=false"
    >
        <div class="message-item_header">
            <span class="message-item_header_author">
                <inline class="clickable" @click="insertUsername()" :title="`@${username}`">{{ username }}</inline>
                <inline v-if="root && message.replyTo && message.replyTo.userId!==root.user.id">
                    <span class="codicon codicon-chevron-right"></span>
                    <inline class="clickable" @click="insertReplyUser()" :title="`@${message.replyTo.username}`">{{ message.replyTo.username }}</inline>
                </inline>
            </span>
            <span class="message-item_header_date" :title="new Date(message.timestamp).toLocaleString()">{{ formatTimestamp }}</span>
        </div>
        <div class="message-item_content" @click="handleClick($event)" v-html="parsedContent"></div>
        <div class="message-item_actions">
            <vscode-button
                @mouseenter="hoverButton='reply'"
                @mouseleave="hoverButton=''"
                @click="showReply=!showReply"
                appearance="icon" aria-label="Reply">
                <span class="codicon codicon-comment"></span>
                &nbsp;
                <inline v-show="hoverButton=='reply'">Reply</inline>
            </vscode-button>
        </div>
        <InputBox
            ref="inputBox"
            v-focus v-if="showReply"
            @keydown.enter.exact="showReply=false"
            @keydown.escape.exact="showReply=false"
            :context="replyContext" :placeholder="`Reply to @${username}`"
        />
    </div>
</template>

<style scoped>
    .message-item {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
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
        color: var(--vscode-descriptionForeground);
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
        color: var(--vscode-descriptionForeground);
    }

    .clickable {
        cursor: pointer;
    }

    .showup {
        width: 98%;
        border: 2px solid var(--vscode-focusBorder);
        border-radius: 2px;
        transition: border-color 0.5s ease-in;
    }
</style>