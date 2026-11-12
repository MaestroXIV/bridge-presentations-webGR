<template>
    <div class="configurator">
        <div class="configurator-header">
            <h1>Bridge Presentation Configurator</h1>
            <div class="header-actions">
                <button class="btn btn-secondary" @click="save">Save scene</button>
                <input type='file' accept=".deal" @change='e => load(e)' ref="loadform" hidden />
                <button class="btn btn-secondary" @click="loadClicked">Load scene</button>
                <button class="btn btn-secondary" :class="{ 'btn-active': showImport }" @click="showImport = !showImport">Import LIN</button>
                <button class="btn btn-secondary" @click="openAudienceWindow()" title="Opens a second window that shows only the table; drag it to the projector or share it in your video call">Audience window</button>
                <button class="btn btn-secondary" @click="openPresenterWith(options)" title="Record session analyses and lessons: deal, auction, results, webcam circle">Presenter mode</button>
                <button class="btn btn-primary btn-large" @click="submit">Start Game</button>
            </div>
        </div>

        <div class="configurator-content">
            <div class="content-grid">
                <!-- Left Column -->
                <div class="column">
                <!-- LIN import Section -->
                <div class="section import-section" v-if="showImport">
                    <div class="section-header">
                        <h2>Import from BBO (LIN)</h2>
                        <div class="header-buttons">
                            <input type="file" accept=".lin,.txt,.html,.htm" @change="e => importLinFile(e)" ref="linform" hidden />
                            <button class="btn btn-secondary btn-small" @click="linform?.click()">Open .lin / Myhands .html</button>
                            <button class="btn btn-secondary btn-small" @click="parseLinInput">Parse</button>
                        </div>
                    </div>
                    <textarea
                        class="input lin-input"
                        v-model="linInput"
                        rows="3"
                        placeholder="Paste LIN text (pn|…|md|…|mb|…|pc|…|), a BBO handviewer link, or the HTML of a saved BBO Myhands page (whole tourney)"
                        @keydown.stop
                    ></textarea>
                    <div class="error-message" v-if="linError">{{ linError }}</div>
                    <div class="lin-boards" v-if="linBoards.length">
                        <div class="lin-title" v-if="linTitle">{{ linTitle }} · {{ linBoards.length }} boards</div>
                        <div class="lin-table-wrap" v-if="linBoards.length > 1">
                            <table class="lin-table">
                                <thead><tr><th>#</th><th>Result</th><th>Score</th><th>%</th><th>N / S</th><th>E / W</th><th>Cards</th></tr></thead>
                                <tbody>
                                    <tr v-for="(b, i) in linBoards" :key="i" :class="{ selected: i === linBoardIndex }" @click="linBoardIndex = i">
                                        <td>{{ b.number ?? i + 1 }}</td>
                                        <td>{{ b.result?.contract || boardSummary(b) }}</td>
                                        <td :class="{ neg: (b.result?.score ?? 0) < 0 }">{{ b.result?.score ?? "" }}</td>
                                        <td>{{ b.result?.percent ?? "" }}</td>
                                        <td class="dim">{{ b.players.north }} / {{ b.players.south }}</td>
                                        <td class="dim">{{ b.players.east }} / {{ b.players.west }}</td>
                                        <td class="dim">{{ b.script.actions.filter(a => a.t === "play").length }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="lin-summary" v-if="linBoard">
                            <div><strong>{{ linBoard.name }}</strong> · dealer {{ positions[linBoard.dealer] }} · vul {{ vulnerabilities[linBoard.vulnerability] }}</div>
                            <div>{{ boardSummary(linBoard) }}</div>
                            <div class="lin-players" v-if="linBoard.players.north || linBoard.players.south">
                                N {{ linBoard.players.north }} · E {{ linBoard.players.east }} · S {{ linBoard.players.south }} · W {{ linBoard.players.west }}
                            </div>
                            <div class="error-list" v-if="linBoard.warnings.length">
                                <div v-for="w in linBoard.warnings" :key="w" class="error-item">{{ w }}</div>
                            </div>
                        </div>
                        <div class="header-buttons">
                            <button class="btn btn-primary btn-small" @click="applyLinBoard">Use this board</button>
                            <button v-if="linBoards.length > 1" class="btn btn-primary btn-small" @click="loadPlaylist">Load all {{ linBoards.length }} boards</button>
                        </div>
                    </div>
                </div>

                <!-- Playlist navigation -->
                <div class="section playlist-section" v-if="options.playlist">
                    <div class="section-header">
                        <h2>Session</h2>
                        <div class="header-buttons">
                            <button class="btn btn-secondary btn-small" :disabled="options.playlist.index <= 0" @click="goToBoard(-1)">◀ Prev</button>
                            <button class="btn btn-secondary btn-small" :disabled="options.playlist.index >= options.playlist.boards.length - 1" @click="goToBoard(1)">Next ▶</button>
                            <button class="btn btn-secondary btn-small" @click="options.playlist = undefined">Close session</button>
                        </div>
                    </div>
                    <div class="lin-summary">
                        <div><strong>{{ options.playlist.title }}</strong></div>
                        <div>Board {{ options.playlist.index + 1 }} of {{ options.playlist.boards.length }}
                            <template v-if="options.playlist.boards[options.playlist.index]?.result"> · {{ options.playlist.boards[options.playlist.index].result?.contract }} · {{ options.playlist.boards[options.playlist.index].result?.percent }}</template>
                        </div>
                        <div class="playlist-chips">
                            <button v-for="(b, i) in options.playlist.boards" :key="i" class="chip" :class="{ selected: i === options.playlist.index }" @click="goToBoard(i - options.playlist.index)" :title="b.result?.contract">{{ b.number ?? i + 1 }}</button>
                        </div>
                    </div>
                </div>

                <!-- Cards Section -->
                <div class="section">
                    <div class="section-header">
                        <h2>Cards <span class="badge" v-if="options.script" :title="options.script.label">recorded play attached · {{ scriptCardCount }} cards</span></h2>
                        <div class="header-buttons">
                            <button v-if="options.script" class="btn btn-secondary btn-small" @click="options.script = undefined">Remove play</button>
                            <button class="btn btn-secondary btn-small" @click="genDealPartial">Generate Rest</button>
                            <button class="btn btn-secondary btn-small" @click="genDeal">Generate Deal</button>
                            <button class="btn btn-secondary btn-small" @click="clear">Clear Cards</button>
                        </div>
                    </div>
                    <div class="cards-grid">
                        <template v-for="(label, pos) in positions" :key="pos">
                            <div class="card-input-group">
                                <label :for="pos" class="card-label">{{ label }}</label>
                                <input 
                                    :id="pos" 
                                    type="text" 
                                    v-model="options.cards[pos]" 
                                    class="card-input"
                                    :class="{ 'error': showCardInputErrors && cardErrors.has(pos as Position) }"
                                    @input="debugInput($event, pos)"
                                    @keydown="debugKeydown($event, pos)"
                                />
                                <div class="error-list" v-if="showCardInputErrors && cardErrors.has(pos as Position) && cardErrors.get(pos as Position)?.length">
                                    <div v-for="err in cardErrors.get(pos as Position)" :key="err" class="error-item">
                                        {{ err }}
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
  <!-- Advanced Settings Section -->
  <div class="section">
                    <h2>Advanced Settings</h2>
                    <div class="settings-grid">
                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="fake-tricks" v-model="fakeTricks" class="checkbox" />
                                <span class="checkmark"></span>
                                Fake Trick Count
                            </label>
                            <div v-if="fakeTricks" class="fake-tricks-inputs">
                                <div class="fake-input-group">
                                    <label for="fake-ns">NS:</label>
                                    <input type="number" id="fake-ns" v-model.number="options.fake.ns" class="input small" />
                                </div>
                                <div class="fake-input-group">
                                    <label for="fake-ew">EW:</label>
                                    <input type="number" id="fake-ew" v-model.number="options.fake.ew" class="input small" />
                                </div>
                            </div>
                        </div>

                        <div class="setting-group" v-if="options.bidding">
                            <label class="checkbox-label disabled">
                                <input type="checkbox" id="fake-auction" v-model="fakeAuction" class="checkbox" disabled />
                                <span class="checkmark"></span>
                                Fake Auction (Not supported)
                            </label>
                        </div>

                        <div class="setting-group">
                            <label>Active Positions</label>
                            <div class="active-positions">
                                <div class="position-checkboxes">
                                    <label v-for="(label, position) in positions" :key="position" class="checkbox-label">
                                        <input 
                                            type="checkbox" 
                                            :value="position" 
                                            v-model="options.activePositions" 
                                            class="checkbox"
                                        />
                                        <span class="checkmark"></span>
                                        {{ label }}
                                    </label>
                                </div>
                                <div class="position-buttons">
                                    <button @click="setActiveNS" class="btn btn-small">NS</button>
                                    <button @click="setActiveEW" class="btn btn-small">EW</button>
                                    <button @click="setActiveAll" class="btn btn-small">All</button>
                                </div>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label for="end-message">End Message</label>
                            <input 
                                type="text" 
                                id="end-message" 
                                v-model="options.uiOptions.endMessage" 
                                placeholder="Custom message to show at game end"
                                class="input"
                            />
                            <label for="rotation">Layout</label>
                            <div class="radio-group" id="vertical-layout">
                                <label>
                                    <input
                                        type="radio"
                                        name="vertical-layout"
                                        :value="true"
                                        v-model="options.uiOptions.verticalLayout"
                                    />
                                    Vertical
                                </label>
                                <label>
                                    <input
                                        type="radio"
                                        name="vertical-layout"
                                        :value="false"
                                        v-model="options.uiOptions.verticalLayout"
                                    />
                                    Cross (original)
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Right Column -->
            <div class="column">
              

                <!-- Game Settings Section -->
                <div class="section">
                    <h2>Game Settings</h2>
                    <div class="settings-grid">
                        <div class="setting-group">
                            <label for="vulnerability">Vulnerability</label>
                            <select id="vulnerability" v-model="options.vulnerability" class="select">
                                <option :value="vul" v-for="(label, vul) in vulnerabilities" :key="vul">{{ label }}</option>
                            </select>
                        </div>

                        <div class="setting-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="include-auction" v-model="options.bidding" class="checkbox" />
                                <span class="checkmark"></span>
                                Include Auction
                            </label>
                        </div>

                        <template v-if="!options.bidding">
                            <div class="setting-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="specify-contract" v-model="specifyContract" class="checkbox" />
                                    <span class="checkmark"></span>
                                    Specify Contract
                                </label>
                            </div>

                            <div class="setting-group" v-if="specifyContract">
                                <label for="contract-input">Contract</label>
                                <div class="contract-input-group">
                                    <input 
                                        type="text" 
                                        id="contract-input"
                                        v-model="contractInput" 
                                        placeholder="4SxE" 
                                        class="input"
                                    />
                                    <span class="contract-display">{{ contract }}</span>
                                </div>
                            </div>

                            <div class="setting-group" v-if="!specifyContract">
                                <label for="trumps">Trumps</label>
                                <select id="trumps" v-model="options.trumps" class="select">
                                    <option :value="suit" v-for="(label, suit) in suits" :key="suit">{{ label }}</option>
                                </select>
                            </div>

                            <div class="setting-group">
                                <label for="dummy">Dummy</label>
                                <select id="dummy" v-model="options.dummy" class="select">
                                    <option value="auto">Show after lead</option>
                                    <option value="static">Static</option>
                                    <option value="none">None</option>
                                </select>
                            </div>

                            <div class="setting-group" v-if="options.dummy === 'static' && !specifyContract">
                                <label for="static-dummy">Static Dummy Position</label>
                                <select id="static-dummy" v-model="options.staticDummyPosition" class="select">
                                    <option :value="pos" v-for="(label, pos) in positions" :key="pos">{{ label }}</option>
                                </select>
                            </div>
                        </template>

                        <template v-if="options.bidding || (options.dummy !== 'auto' || !specifyContract)">
                            <div class="setting-group" v-if="'firstPlayer' in errors">
                                <div class="error-message">{{ errors.firstPlayer }}</div>
                            </div>
                            <div class="setting-group">
                                <label for="first-player">{{ options.bidding ? "Dealer" : "First to play" }}</label>
                                <select id="first-player" v-model="options.firstPlayer" class="select">
                                    <option :value="pos" v-for="(label, pos) in positions" :key="pos">{{ label }}</option>
                                </select>
                            </div>
                        </template>
                    </div>
                </div>
                <!-- Controls Reference Section -->
                <div class="section">
                    <h2>Keyboard Controls</h2>
                    <div class="controls-grid">
                        <div class="control-item">
                            <div class="key">+</div>
                            <span>Start game</span>
                        </div>
                        <div class="control-item">
                            <div class="keys"><span class="key">Ctrl</span>+<span class="key">Q</span></div>
                            <span>Toggle this menu</span>
                        </div>
                        <div class="control-item">
                            <div class="keys">
                                <span class="key"><arrow direction="up" /></span>
                                <span class="key"><arrow direction="left" /></span>
                                <span class="key"><arrow direction="down" /></span>
                                <span class="key"><arrow direction="right" /></span>
                            </div>
                            <span>Toggle hand visibility</span>
                        </div>
                        <div class="control-item">
                            <div class="keys">
                                <span class="key">Ctrl</span>+
                                <div class="key-grid">
                                    <span class="key"><arrow direction="up" /></span>
                                    <span class="key"><arrow direction="left" /></span>
                                    <span class="key"><arrow direction="down" /></span>
                                    <span class="key"><arrow direction="right" /></span>
                                </div>
                            </div>
                            <span>Show one hand, hide others</span>
                        </div>
                        <div class="control-item">
                            <div class="key">Z</div>
                            <span>Undo</span>
                        </div>
                        <div class="control-item">
                            <div class="keys">
                                <span class="key">0</span>-<span class="key">9</span>
                                <span class="key">/</span>
                                <span class="key">*</span>
                                <span class="key">-</span>
                            </div>
                            <span>Play card</span>
                        </div>
                        <div class="control-item">
                            <div class="key">C</div>
                            <span>Claim</span>
                        </div>
                        <div class="control-item">
                            <div class="key">Spacebar</div>
                            <span>Pass (in auction)</span>
                        </div>
                        <div class="control-item">
                            <div class="keys"><span class="key">N</span> <span class="key">A</span></div>
                            <span>Replay: next card / auto-play (imported LIN)</span>
                        </div>
                        <div class="control-item">
                            <div class="key">B</div>
                            <span>Replay: undo back to the actual line</span>
                        </div>
                        <div class="control-item">
                            <div class="key">W</div>
                            <span>Open the audience window</span>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>

        <div class="configurator-footer">
            <div class="footer-content">
                <span class="author">Created by <a href="https://bridge.zdenektomis.eu/en" target="_blank" rel="noopener">Zdenek Tomis</a></span>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef, watch, onMounted } from "vue";
import { Suit } from "@/bridge/model/Suit";
import { CardsInputValidator } from "../class/deal-validator";
import { Position } from "@/bridge/model/Position";
import { Vulnerability } from "@/bridge/model/Vulnerability";
import { downloadObjectAsJson, loadJson, FileEventTarget } from "@/presentations/class/json-utils";
import { NonPassedContract } from "@/bridge/model/Contract";
import { ConfiguratorOptions, getDefaultConfiguratorOptions, validateConfiguratorOptions } from "@/presentations/class/options";
import Arrow from "@/presentations/components/partial/Arrow.vue";

import { ref, reactive } from "vue";
import { DealLike, generateDeal, generateDealWithCards } from "../class/deal-generator";
import { LinBoard, importLin } from "../class/lin";
import { openPresenterWith } from "@/studio/handoff";
import { contractToShortString, simulateScript } from "../class/script";
import { openAudienceWindow } from "../class/transport";

// LIN import
const showImport = ref(false);
const linInput = ref("");
const linError = ref("");
const linBoards = ref<LinBoard[]>([]);
const linTitle = ref<string | undefined>();
const linBoardIndex = ref(0);
const linform = useTemplateRef<HTMLInputElement>("linform");
const linBoard = computed<LinBoard | undefined>(() => linBoards.value[linBoardIndex.value]);

function parseLinText(text: string) {
    linError.value = "";
    try {
        const imp = importLin(text);
        if (imp.boards.length === 0) {
            linError.value = "No deal found — expected a LIN string with an md| token, a handviewer link, or a saved BBO Myhands page.";
            linBoards.value = [];
            return;
        }
        linBoards.value = imp.boards;
        linTitle.value = imp.title;
        linBoardIndex.value = 0;
    } catch (e) {
        linError.value = `Could not parse: ${(e as Error).message}`;
        linBoards.value = [];
    }
}

function parseLinInput() {
    parseLinText(linInput.value);
}

function importLinFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => {
        linInput.value = text.length > 4000 ? `[${file.name}, ${text.length} characters]` : text;
        parseLinText(text);
        input.value = "";
    });
}

function boardSummary(b: LinBoard): string {
    const sim = simulateScript(b.cards, b.dealer, b.script.actions);
    const contract = contractToShortString(sim.contract) || "no contract";
    const tricks = sim.tricksDeclarer !== undefined ? ` · ${sim.tricksDeclarer} tricks` : "";
    const cards = ` · ${sim.cardsPlayed} cards`;
    const err = sim.errors.length ? ` · ${sim.errors[0]}` : "";
    return `${contract}${tricks}${cards}${err}`;
}

function applyBoard(b: LinBoard) {
    options.cards = { ...b.cards };
    options.firstPlayer = b.dealer;
    options.vulnerability = b.vulnerability;
    options.bidding = b.script.actions.some((a) => a.t === "bid");
    options.contract = undefined;
    options.activePositions = [Position.North, Position.East, Position.South, Position.West];
    options.script = b.script;
    specifyContract.value = false;
}

function applyLinBoard() {
    const b = linBoard.value;
    if (!b) return;
    options.playlist = undefined;
    applyBoard(b);
    showImport.value = false;
}

function loadPlaylist() {
    if (!linBoards.value.length) return;
    options.playlist = {
        title: linTitle.value ?? `${linBoards.value.length} boards`,
        index: linBoardIndex.value,
        boards: linBoards.value,
    };
    applyBoard(linBoards.value[linBoardIndex.value]);
    showImport.value = false;
}

/** Moves within the loaded session by `delta` boards and applies that board. Returns false at the ends. */
function goToBoard(delta: number): boolean {
    const pl = options.playlist;
    if (!pl) return false;
    const next = pl.index + delta;
    if (next < 0 || next >= pl.boards.length) return false;
    pl.index = next;
    applyBoard(pl.boards[next]);
    return true;
}

defineExpose({ goToBoard, submit });

const scriptCardCount = computed(() => options.script?.actions.filter((a) => a.t === "play").length ?? 0);


const STORAGE_KEY = 'bridge-presentation-config';

const options = reactive(getDefaultConfiguratorOptions());
const contractInput = ref("");
const specifyContract = ref(false);
const fakeTricks = ref(false);
const fakeAuction = ref(false);

const positions = {
    [Position.North]: "North",
    [Position.East]: "East",
    [Position.South]: "South",
    [Position.West]: "West",
};

const vulnerabilities = {
    [Vulnerability.Both]: "Both",
    [Vulnerability.None]: "None",
    [Vulnerability.NS]: "NS",
    [Vulnerability.EW]: "EW",
};

const suits = {
    [Suit.Spades]: "♠",
    [Suit.Hearts]: "♥",
    [Suit.Diamonds]: "♦",
    [Suit.Clubs]: "♣",
    [Suit.Notrump]: "NT",
};

const emit = defineEmits<{
    (e: 'submit', options: ConfiguratorOptions): void;
    (e: 'update:options', options: ConfiguratorOptions): void;
}>();

function submit() {
    if (!options.bidding && specifyContract.value && !options.contract) return;
    emit("submit", options);
}

function clear() {
    options.cards = {
        north: "",
        east: "",
        west: "",
        south: "",
    };
}

function save() {
    const name = prompt("Enter file name");
    if (name) downloadObjectAsJson(options, name + ".deal");
}
const loadform = useTemplateRef<HTMLInputElement>("loadform");
function load(event: Event) {
    (loadform.value as HTMLElement).blur();
    loadJson(event.target as FileEventTarget).then(setOptions);
}
function loadClicked() {
    (loadform.value as HTMLElement).click();
}

function setOptions(a?: ConfiguratorOptions) {
    if (!a) return;
    Object.assign(options, a);
    options.script = a.script;
    options.playlist = a.playlist;
    fakeTricks.value = a.fake?.ns > 0 || a.fake?.ew > 0;
    specifyContract.value = a.contract !== undefined;
    fakeAuction.value = a.bidding;

    if (options.bidding) {
        specifyContract.value = false;
    }
    else if (options.contract) {
        specifyContract.value = true;
    }
    if (options.contract && options.contract !== "passed")
        options.contract = new NonPassedContract(options.contract.suit, options.contract.level, options.contract.declarer, options.contract.dbl);
    
    // Save to local storage after loading from file
    saveToLocalStorage();
}


function parseContract(value: string) {
    const c = NonPassedContract.fromString(value);
    if (c) options.contract = c;
}
watch(specifyContract, (value: boolean) => {
    if (!value) options.contract = undefined;
    else parseContract(contractInput.value);
});
watch(contractInput, (value: string) => {
    parseContract(value);
});


function setActiveNS() {
    options.activePositions = [Position.North, Position.South];
}

function setActiveEW() {
    options.activePositions = [Position.East, Position.West];
}

function setActiveAll() {
    options.activePositions = [Position.North, Position.South, Position.East, Position.West];
}

watch(() => options.bidding, (value: boolean) => {
    if (value) specifyContract.value = false;
});

const contract = computed(() => {
    return options.contract && options.contract !== "passed"
        ? NonPassedContract.toString(options.contract)
        : "";
});

const cardErrors = computed(() => {
    return CardsInputValidator.validate(
        new Map<Position, string>(
            Object.entries(options.cards) as unknown as Iterable<readonly [Position, string]>
        )
    );
});

const showCardInputErrors = computed(() => {
    return Object.values(options.cards).map(s => s.length).every(a => a > 10);
});

const errors = computed(() => {
    return validateConfiguratorOptions(options);
});

function genDeal() {
    const deal = generateDeal();
    options.cards = deal;
}

let lastUsedCards: DealLike | undefined = undefined;

function genDealPartial() {
    let partialCards = {...options.cards};
    const isFull = Object.values(partialCards).every(c => c.replaceAll(/[\s\-]/g, "").length === 13);
    if(isFull && lastUsedCards !== undefined) 
        partialCards = lastUsedCards;
    else if(isFull) return;    
    const deal = generateDealWithCards(partialCards);
    lastUsedCards = partialCards;
    options.cards = deal;
}

function debugInput(event: Event, pos: string) {
    const target = event.target as HTMLInputElement;
    console.log(`Input event for ${pos}:`, {
        value: target.value,
        key: (event as any).key,
        inputType: (event as any).inputType
    });
}

function debugKeydown(event: KeyboardEvent, pos: string) {
    console.log(`Keydown event for ${pos}:`, {
        key: event.key,
        code: event.code,
        charCode: event.charCode,
        keyCode: event.keyCode,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
    });
}

// Local storage functions
function saveToLocalStorage() {
    try {
        const configToSave = {
            ...options,
            contractInput: contractInput.value,
            specifyContract: specifyContract.value,
            fakeTricks: fakeTricks.value,
            fakeAuction: fakeAuction.value
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    } catch (error) {
        console.warn('Failed to save configuration to local storage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsedConfig = JSON.parse(saved);
            
            // Use existing setOptions function to restore configuration
            setOptions(parsedConfig);
            
            // Restore UI state that's not part of ConfiguratorOptions
            if (parsedConfig.contractInput !== undefined) {
                contractInput.value = parsedConfig.contractInput;
            }
        }
    } catch (error) {
        console.warn('Failed to load configuration from local storage:', error);
    }
}

// Load configuration on component mount
onMounted(() => {
    loadFromLocalStorage();
});

// Watch for changes and save to local storage
watch(options, () => {
    saveToLocalStorage();
}, { deep: true });

watch(contractInput, () => {
    saveToLocalStorage();
});

watch(specifyContract, () => {
    saveToLocalStorage();
});

watch(fakeTricks, () => {
    saveToLocalStorage();
});

watch(fakeAuction, () => {
    saveToLocalStorage();
});
</script>

<style lang="scss">
@use '../../presenter/assets/style/_variables.scss' as variables;

.configurator {
    width: 100%;
    min-height: 100vh;
    background-color: variables.$background;
    color: variables.$primary;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.configurator-header {
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    padding: 10px 20px;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);

    h1 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
        background: linear-gradient(45deg, #fff, #ccc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .header-actions {
        display: flex;
        gap: 6px;
        align-items: center;
    }
}

.configurator-content {
    flex: 1;
    padding: 20px;
    display: flex;
    justify-content: center;

    .content-grid {
        max-width: 1400px;
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        align-items: start;

        @media (max-width: 1200px) {
            grid-template-columns: 1fr;
            gap: 15px;
        }
    }
}

.column {
    display: flex;
    flex-direction: column;
    gap: 20px;

    @media (max-width: 1200px) {
        gap: 15px;
    }
}

.section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        padding-bottom: 8px;

        h2 {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 500;
            color: #fff;
        }

        .header-buttons {
            display: flex;
            gap: 8px;
        }
    }

    & > h2 {
        margin: 0 0 15px 0;
        font-size: 1.2rem;
        font-weight: 500;
        color: #fff;
        border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        padding-bottom: 8px;
    }
}

.cards-grid {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.card-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .card-label {
        font-weight: 500;
        color: #ccc;
        font-size: 0.85rem;
    }

    .card-input {
        padding: 10px 14px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        color: variables.$primary;
        font-size: 0.9rem;
        transition: all 0.3s ease;

        &:focus {
            outline: none;
            border-color: #4a9eff;
            box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
        }

        &.error {
            border-color: #ff4757;
            box-shadow: 0 0 0 3px rgba(255, 71, 87, 0.2);
        }
    }
}

.settings-grid {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.setting-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
        font-weight: 500;
        color: #ccc;
        font-size: 0.85rem;
    }

    .error-message {
        color: #ff4757;
        font-size: 0.8rem;
        margin-top: 3px;
    }
}

.input, .select {
    padding: 10px 14px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: variables.$primary;
    font-size: 0.9rem;
    transition: all 0.3s ease;

    &:focus {
        outline: none;
        border-color: #4a9eff;
        box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
    }

    &.small {
        width: 70px;
        padding: 6px 10px;
    }
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-weight: 500;
    color: #ccc;
    font-size: 0.85rem;

    &.disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .checkbox {
        position: relative;
        width: 20px;
        height: 20px;
        appearance: none;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        transition: all 0.3s ease;

        &:checked {
            background: #4a9eff;
            border-color: #4a9eff;

            &::after {
                content: '✓';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                font-size: 12px;
                font-weight: bold;
            }
        }

        &:focus {
            outline: none;
            box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
        }
    }
}

.radio-group {
    display: flex;
    gap: 20px;
    margin-top: 8px;

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-weight: 500;
        color: #ccc;
        font-size: 0.85rem;

        input[type="radio"] {
            position: relative;
            width: 18px;
            height: 18px;
            appearance: none;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            cursor: pointer;
            transition: all 0.3s ease;

            &:checked {
                border-color: #4a9eff;
                background: rgba(255, 255, 255, 0.05);

                &::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #4a9eff;
                }
            }

            &:focus {
                outline: none;
                box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
            }
        }
    }
}

.contract-input-group {
    display: flex;
    align-items: center;
    gap: 12px;

    .contract-display {
        color: #4a9eff;
        font-weight: 500;
        font-size: 1.1rem;
    }
}

.fake-tricks-inputs {
    display: flex;
    gap: 20px;
    margin-top: 12px;

    .fake-input-group {
        display: flex;
        align-items: center;
        gap: 8px;

        label {
            font-size: 0.85rem;
            color: #aaa;
        }
    }
}

.active-positions {
    display: flex;
    flex-direction: column;
    gap: 15px;

    .position-checkboxes {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .position-buttons {
        display: flex;
        gap: 8px;
    }
}

.controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    flex-direction: column;
    gap: 12px;
}

.control-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);

    span {
        color: #ccc;
        font-size: 0.85rem;
    }
}

.key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: variables.$primary;
    font-size: 0.8rem;
    font-weight: 500;
    user-select: none;
}

.keys {
    display: flex;
    align-items: center;
    gap: 4px;
}

.key-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 0.3px;

    &.btn-primary {
        background: linear-gradient(135deg, #4a9eff 0%, #357abd 100%);
        color: white;
        box-shadow: 0 3px 10px rgba(74, 158, 255, 0.3);

        &:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 15px rgba(74, 158, 255, 0.4);
        }
    }

    &.btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: variables.$primary;
        border: 1px solid rgba(255, 255, 255, 0.2);

        &:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
        }
    }

    &.btn-small {
        padding: 5px 10px;
        font-size: 0.75rem;
    }

    &.btn-large {
        padding: 10px 24px;
        font-size: 0.95rem;
    }
}

.configurator-footer {
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px 20px;
    display: flex;
    justify-content: center;
    align-items: center;

    .footer-content {
        display: flex;
        align-items: center;
        gap: 10px;

        .author {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.8rem;
            font-weight: 400;
        }
    }
}

.import-section {
    .lin-input {
        width: 100%;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 0.8rem;
        resize: vertical;
    }
    .lin-boards {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 12px;
    }
    .lin-summary {
        color: #ccc;
        font-size: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 3px;
        .lin-players { color: #999; }
    }
}

.lin-title {
    color: #ddd;
    font-weight: 500;
    font-size: 0.9rem;
}
.lin-table-wrap {
    max-height: 260px;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
}
.lin-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    color: #ccc;
    th, td { padding: 5px 8px; text-align: left; white-space: nowrap; }
    th { color: #888; font-weight: 500; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; position: sticky; top: 0; background: #1d1d1d; }
    tbody tr { cursor: pointer; border-top: 1px solid rgba(255, 255, 255, 0.06); }
    tbody tr:hover { background: rgba(255, 255, 255, 0.06); }
    tbody tr.selected { background: rgba(74, 158, 255, 0.18); color: #fff; }
    td.neg { color: #ff8a8a; }
    td.dim { color: #888; }
}
.playlist-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    .chip {
        min-width: 30px;
        padding: 3px 6px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: #ccc;
        font-size: 0.75rem;
        cursor: pointer;
        &.selected { background: #4a9eff; border-color: #4a9eff; color: #fff; }
        &:hover:not(.selected) { background: rgba(255, 255, 255, 0.12); }
    }
}

.badge {
    display: inline-block;
    margin-left: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 500;
    vertical-align: middle;
    background: rgba(156, 204, 156, 0.15);
    border: 1px solid rgba(156, 204, 156, 0.5);
    color: #9ccc9c;
}

.btn.btn-active {
    border-color: #4a9eff;
    color: #4a9eff;
}

.error-list {
    margin-top: 8px;
    max-height: 100px;
    overflow-y: auto;

    .error-item {
        color: #ff4757;
        font-size: 0.8rem;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255, 71, 87, 0.2);

        &:last-child {
            border-bottom: none;
        }
    }
}

// Scrollbar styling
.configurator-content::-webkit-scrollbar {
    width: 8px;
}

.configurator-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}

.configurator-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;

    &:hover {
        background: rgba(255, 255, 255, 0.5);
    }
}
</style>
