<template>
  <audience-view v-if="audience"></audience-view>
  <template v-else>
    <configurator ref="configurator" v-show="state === 'configurator'" @submit="startGame" @update:options="updateOptions"></configurator>
    <presenter ref="presenter" v-show="state === 'presenter'" :options="options" @navigate-board="navigateBoard"></presenter>
  </template>
</template>

<script lang="ts" setup>
import Configurator from '@/presentations/components/Configurator.vue';
import { ConfiguratorOptions, getDefaultConfiguratorOptions } from './class/options';
import { ref } from 'vue';
import Presenter from '@/presentations/components/Presenter.vue';
import AudienceView from '@/presentations/components/AudienceView.vue';
import { useKeyboardShortcut } from '@/presenter/composables/useKeyboardShortcut';
import { isAudienceRole } from './class/transport';

/** ?role=audience: a window that only shows the table, driven by the teacher window */
const audience = isAudienceRole();

const state = ref<'configurator' | 'presenter'>('configurator');
const presenter = ref<typeof Presenter>();
const configurator = ref<typeof Configurator>();

function changeState(newState?: 'configurator' | 'presenter') {
  state.value = newState ? newState : (state.value === 'configurator' ? 'presenter' : 'configurator');
}
const options = ref<ConfiguratorOptions>(getDefaultConfiguratorOptions());

function startGame(opts: ConfiguratorOptions) {
  console.log('startGame', opts);
  changeState('presenter');
  updateOptions(opts);
  presenter.value?.startGame(opts);
}

const updateOptions = (opts: ConfiguratorOptions) => {
  options.value = opts;
}

/** Moves to another board of a loaded session (playlist) and restarts the presentation. */
function navigateBoard(delta: number) {
  if (configurator.value?.goToBoard(delta)) configurator.value?.submit();
}

useKeyboardShortcut("q", "ctrl", () => { if (!audience) changeState(); });
useKeyboardShortcut("PageDown", null, () => { if (!audience && state.value === 'presenter') navigateBoard(1); });
useKeyboardShortcut("PageUp", null, () => { if (!audience && state.value === 'presenter') navigateBoard(-1); });
useKeyboardShortcut("+", null, () => { if (!audience) startGame(options.value); });
</script>

<style lang="scss">
* {
  box-sizing: border-box;
}

h1,
h2 {
  margin: 0;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  height: 100%;
}

body {
  height: 100vh;
  margin: 0;
  overflow: hidden;
}
</style>
