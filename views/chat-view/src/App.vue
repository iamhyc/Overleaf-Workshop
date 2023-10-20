<script setup lang="ts">
    import * as ui from "@vscode/webview-ui-toolkit";
    ui.provideVSCodeDesignSystem().register(ui.allComponents);

    import InputBox from "./components/InputBox.vue";
    import QuickReply from "./components/QuickReply.vue";
</script>

<template>
    <main>
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
    }
</style>
