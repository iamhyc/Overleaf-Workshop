<script setup lang="ts">
    import * as ui from "@vscode/webview-ui-toolkit";
    ui.provideVSCodeDesignSystem().register(ui.allComponents);

    import { ref, onMounted, provide, watchEffect } from "vue";
    import { getMessages, MessageTree, type Message } from "./utils";
    import InputBox from "./components/InputBox.vue";
    import MessageList from "./components/MessageList.vue";
    import NewMessageNotice from "./components/NewMessageNotice.vue";

    const unreadRecord = ref([]);
    const activeInputBox = ref();
    provide('activeInputBox', activeInputBox);
    provide('unreadRecord', unreadRecord);

    const inputBox = ref();
    const messages = ref<Message[]>([]);
    const messageTree = new MessageTree(messages, unreadRecord);

    onMounted(() => {
        window.addEventListener('message', async (e) => {
            const data = e.data;
            switch (data.type) {
                case 'get-messages':
                    messageTree.userId = data.userId;
                    messageTree.update(data.content.reverse());
                    break;
                case 'new-message':
                    messageTree.pushMessage(data.content, true);
                    break;
                case 'insert-text':
                    if (!inputBox.value) { return; }
                    inputBox.value.insertText(data.content);
                    break;
            }
        });

        watchEffect(async () => {
            if (activeInputBox.value===undefined || activeInputBox.value.value===undefined) {
                activeInputBox.value = inputBox;
            }
        });

        getMessages();
    });
</script>

<template>
    <main>
        <MessageList :messages="messages" />
        <NewMessageNotice :unread="[]" />
        <InputBox ref="inputBox" />
    </main>
</template>

<style src="@vscode/codicons/dist/codicon.css"></style>
<style>
    html,body,#app {
        height: 100%;
    }
    main {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: flex-end;
        height: 100%;
        overflow: auto;
    }
</style>
