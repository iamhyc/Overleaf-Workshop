<script setup lang="ts">
    import { ref, watchEffect, provide, type Ref } from 'vue';
    import { type Message } from '../utils';
    import MessageItem from './MessageItem.vue';

    const props = defineProps<{
        messages: Message[],
    }>();
    const messageContainer = ref<HTMLDivElement>();
    const refs: {[id:string]:any} = ref({});
    const messageRecord: Ref<{[index:number]:string}> = ref({});

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

    function navigate(goUp:boolean) {
        // sort messageRecord value by key (index)
        const sortedMessageRecord = Object.entries(messageRecord.value).sort((a,b) => Number(a[0])-Number(b[0]));
        const messageList = sortedMessageRecord.map((item) => item[1]);

        // get the current focused message in refs
        let focusedMessageIndex = messageList.findIndex((messageId) => (refs.value)[messageId].isFocused);
        focusedMessageIndex = focusedMessageIndex>=0 ? focusedMessageIndex : messageList.length-1;

        // find the next message to focus
        let nextMessageIndex = goUp ? focusedMessageIndex-1 : focusedMessageIndex+1;
        nextMessageIndex = nextMessageIndex<0 ? 0 : nextMessageIndex;
        nextMessageIndex = nextMessageIndex>=messageList.length ? messageList.length-1 : nextMessageIndex;

        // focus the next message
        const nextMessageId = messageList[nextMessageIndex];
        (refs.value)[ nextMessageId ].focus();
        // console.log('navigate', focusedMessageIndex, nextMessageIndex);
    }

    const scrollItemIntoView = (messageId: string) => {
        (refs.value)[ messageId ].scrollIntoView();
    };

    defineExpose({
        scrollItemIntoView,
    });
</script>

<template>
    <div v-if="messages.length === 0" role="list" class="empty-container">
        <span>No messages yet</span>
    </div>
    <div v-else role="list" class="message-container" ref="messageContainer" @keyup.up="navigate(true)" @keyup.down="navigate(false)" >
        <template v-for="(message,index) in messages" :key="message.id">
            <vscode-divider role="separator"></vscode-divider>
            <MessageItem :message="message" :now="now" :ref="(el) => {refs[message.id] = el; messageRecord[index*100] = message.id;}"
                :aria-posinset="index+1" :aria-setsize="messages.length" />
            <MessageItem
                v-if="message.replies" v-for="(reply,subIndex) in message.replies"
                class="indent" :key="reply.id" :ref="(el) => {refs[reply.id] = el; messageRecord[index*100+subIndex+1] = reply.id;}"
                :root="message" :message="reply" :now="now"
                :aria-posinset="subIndex+1" :aria-setsize="message.replies.length"
            />
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