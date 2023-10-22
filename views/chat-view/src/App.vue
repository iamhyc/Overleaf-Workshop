<script setup lang="ts">
    import * as ui from "@vscode/webview-ui-toolkit";
    ui.provideVSCodeDesignSystem().register(ui.allComponents);

    import { ref, onMounted } from "vue";
    import { getMessages, MessageTree, type Message } from "./utils";
    import InputBox from "./components/InputBox.vue";
    import MessageList from "./components/MessageList.vue";

    const messages = ref<Message[]>([]);
    const messageTree = new MessageTree(messages);

    onMounted(() => {
        window.addEventListener('message', async (e) => {
            const data = e.data;
            switch (data.type) {
                case 'get-messages':
                    messageTree.update(data.content.reverse());
                    break;
                case 'new-message':
                    messageTree.pushMessage(data.content);
                    break;
            }
        });

        getMessages();
    });
</script>

<template>
    <main>
        <MessageList :messages="messages" />
        <InputBox />
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
