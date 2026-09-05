<template>
  <div ref="gameView" @click="update" :class="{ debug: debug}" class="game-view">
    <CardProvider :cards="cards" :game="game" :dummy="dummy" v-slot="{ cardViews, cardDimensions }">
      <div class="main-view" ref="mainView" :class="{ vertical: verticalCardLayout }">
        <component :is="verticalCardLayout ? VerticalHandView : OneDimensionalHandView" ref="handViewWest"
          :hand="game?.players[Position.West].hand" :position="Position.West" :rotation="Orientation.Left"
          :dummy="dummy === Position.West" :prioritizedSuit="dummy === Position.West ? getTrumpSuit() : undefined"
          :cardViews="cardViews" :cardDimensions="cardDimensions"
          :reverse="!handsVisible.get(Position.West)" class="hand-west"></component>
        <div class="center-column">
          <OneDimensionalHandView ref="handViewNorth" :hand="game?.players[Position.North].hand"
            :position="Position.North" :rotation="Orientation.Up" :dummy="dummy === Position.North"
            :prioritizedSuit="dummy === Position.North ? getTrumpSuit() : undefined"
            :cardViews="cardViews" :cardDimensions="cardDimensions" :reverse="!handsVisible.get(Position.North)">
          </OneDimensionalHandView>
          <div class="filler"></div>

          <div class="center-frame-container">
            <BiddingCenterPanel class="bidding-center-panel" :auction-visible="auctionVisible" :game="game">
              <CenterNSEWFrame :vulnerability="game?.vulnerability" :game="game" class="center-frame">
                <div class="end-text appear" v-show="showEndText" v-html="endText"></div>
              </CenterNSEWFrame>
            </BiddingCenterPanel>
            <BiddingCenterPanel class="bidding-center-panel-fake" :auction-visible="false">
              <!-- Fake bidding center panel - so that trick view has always expanded position -->
              <CenterNSEWFrame class="center-frame" :showFrame="false">
                <TrickView ref="trickView" v-show="!showEndText" :game="game" class="trick-view" :cardViews="cardViews"
                  :vertical-card-layout="verticalCardLayout">
                </TrickView>
              </CenterNSEWFrame>
            </BiddingCenterPanel>
          </div>
          <OneDimensionalHandView ref="handViewSouth" :hand="game?.players[Position.South].hand"
            :position="Position.South" :rotation="dummy === Position.South ? Orientation.Down : Orientation.Up"
            :dummy="dummy === Position.South" :prioritizedSuit="dummy === Position.South ? getTrumpSuit() : undefined"
            :cardViews="cardViews" :cardDimensions="cardDimensions"
            :reverse="!handsVisible.get(Position.South)">
          </OneDimensionalHandView>
        </div>

        <component :is="verticalCardLayout ? VerticalHandView : OneDimensionalHandView" ref="handViewEast"
          :hand="game?.players[Position.East].hand" :position="Position.East" :rotation="Orientation.Right"
          :dummy="dummy === Position.East" :prioritizedSuit="dummy === Position.East ? getTrumpSuit() : undefined"
          :cardViews="cardViews" :cardDimensions="cardDimensions"
          :reverse="!handsVisible.get(Position.East)" class="hand-east"></component>


        <DebugView v-if="debug" :game="game" :cardViews="cardViews"></DebugView>
      </div>
      <BiddingBox v-show="interactive && game?.state === 'bidding'" @bid="biddingBoxCallback" :isBidLegal="isBidLegal"></BiddingBox>
    </CardProvider>
  </div>
</template>

<script setup lang="ts">
import { PresentationGame } from "@/bridge/model/PresentationGame";
import OneDimensionalHandView from "./OneDimensionalHandView.vue";
import { Position } from "@/bridge/model/Position";
import { Orientation } from "@/presenter/model/Orientation";
import CenterNSEWFrame from "./CenterNSEWFrame.vue";
import {
  onMounted,
  ref,
  useTemplateRef,
  watch,
  onUnmounted,
  computed,
  inject,
} from "vue";
import TrickView from "./TrickView.vue";
import CardProvider from "./CardProvider.vue";
import DebugView from "./DebugView.vue";
import BiddingBox from "./BiddingBox.vue";
import BiddingCenterPanel from "./BiddingCenterPanel.vue";
import { Bid } from "@/bridge/model/Bid";
import { PresentationPlayer } from "@/bridge/model/PresentationPlayer";
import { useWaitForClick } from "../composables/usewaitForClick";
import { Card } from "@/bridge/model/Card";
import { Suit } from "@/bridge/model/Suit";
import VerticalHandView from "./VerticalHandView.vue";

const props = withDefaults(defineProps<{
  game: PresentationGame;
  handsVisible?: Map<Position, boolean>;
  endMessage?: string;
  verticalCardLayout?: boolean;
  /** false in the audience window: no bidding box */
  interactive?: boolean;
}>(), {
  verticalCardLayout: false,
  interactive: true,
});

const handsVisible = computed(() => props.handsVisible ?? new Map([
  [Position.North, true],
  [Position.East, true],
  [Position.South, true],
  [Position.West, true],
]));

/** 
 * BIDDING BOX
 */

const biddingBoxCallback = ref<((bid: Bid) => void) | undefined>(undefined);
const isBidLegal = ref<((bid: Bid) => boolean) | undefined>(undefined);
watch(
  () => props.game,
  (game) => {
    // wire bidding box
    if (!game) return;

    game.allPlayers.forEach((player) => {
      player.bidRequested.sub(() => {
        biddingBoxCallback.value = (bid) =>
          (player as PresentationPlayer).bid(bid);
        isBidLegal.value = (bid: Bid) => game.auction?.isLegal(bid, player.position) ?? true;
      });

      player.bidRequestCancelled.sub(() =>
        biddingBoxCallback.value = undefined
      );

      player.bidMade.sub(() =>
        biddingBoxCallback.value = undefined
      );
    });
  }
);

/**
 * RESIZE OBSERVER
 */
let resizeObserver: ResizeObserver | null = null;
const gameView = ref<HTMLDivElement>();

onMounted(() => {
  // Update on window resize
  window.addEventListener("resize", update);

  // Use ResizeObserver for responsive updates
  resizeObserver = new ResizeObserver(() => {
    update();
  });

  if (gameView.value) {
    resizeObserver.observe(gameView.value);
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", update);
  resizeObserver?.disconnect();
});

/**
 * MANUAL UI UPDATE
 * This could be handled better with a more declarative approach not sure.
 */
const trickView = useTemplateRef<typeof TrickView>("trickView");
const handViewWest =
  useTemplateRef<typeof OneDimensionalHandView>("handViewWest");
const handViewNorth =
  useTemplateRef<typeof OneDimensionalHandView>("handViewNorth");
const handViewSouth =
  useTemplateRef<typeof OneDimensionalHandView>("handViewSouth");
const handViewEast =
  useTemplateRef<typeof OneDimensionalHandView>("handViewEast");

function update() {
  handViewWest.value?.update?.();
  handViewNorth.value?.update?.();
  handViewSouth.value?.update?.();
  handViewEast.value?.update?.();
  trickView.value?.update?.();
}

watch(() => props.game, (game) => {
  game.stateChanged.sub(() => {
    update();
  });
  game.cardPlayed.sub(() => {
    update();
  });
  game.undoMade.sub(() => {
    update();
  });
  game.bidMade.sub(() => {
    update();
  });
  update();
}, { deep: false, immediate: true });

/** 
 * AUCTION VISIBILITY
 * After the bidding ends, wait for the user to click the screen to continue to the card play
 */
const auctionVisible = computed(() => {
  return props.game?.state === "bidding" || waitBeforeHidingAuction.waiting.value;
});

const waitBeforeHidingAuction = useWaitForClick();
watch(() => props.game, (game) => {
  game.biddingEnded.sub(() => {
    waitBeforeHidingAuction.set();
  });
  game.cardPlayed.sub(() => {
    waitBeforeHidingAuction.reset();
  });
}, { deep: false, immediate: true });

/**
 * END TEXT VISIBILITY
 */

const waitBeforeShowingEndText = useWaitForClick();

const showEndText = computed(() =>
  props.game?.state === "finished" && !waitBeforeShowingEndText.waiting.value
);

const endText = computed(() => {
  let s = "";
  if (props.game?.finalContract) s += `${props.game.finalContract.toString()} <br>`;
  if (props.game?.result?.tricksMade) s += `${props.game.result.resultString} <br>`;
  if (props.game?.result) s += `${props.game.result.scoreNS} <br>`;
  if (props.endMessage) s += props.endMessage + " <br>";
  return s;
});

watch(() => props.game, (game) => {
  game.stateChanged.sub(() => {
    waitBeforeShowingEndText.set();
  });
}, { deep: false, immediate: true });


const dummy = computed(() => auctionVisible.value ? undefined : props.game.dummy);

function getTrumpSuit(): Suit | undefined {
  const t = props.game?.trumps;
  return t !== undefined && t !== Suit.Notrump ? t : undefined;
}
const cards = ref<Set<Card>>(new Set());

watch(() => props.game, computeCards, { deep: false, immediate: true });

function computeCards(game: PresentationGame) { // manually computed based only on game.
  console.debug("calculating cards")
  if (!game) return;
  const trickCards = game.tricks.flatMap((trick) => trick.cards.map(c => c.card));
  const cardsInHands = game.allPlayers.flatMap(player => player.hand?.cards).filter(c => c !== undefined);
  cards.value = new Set(trickCards.concat(cardsInHands))
}

const debug = inject("debug", false);
</script>

<style lang="scss">
@use "../assets/style/variables" as variables;

.main-view {
  padding: variables.$margin;
  padding-top: variables.$top-space;
  max-height: 100vh;
  aspect-ratio: 1;
  background-color: black;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;

  .center-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  &.vertical {
    .hand-west {
      margin-top: variables.$card-height;
      margin-bottom: variables.$card-height;
    }
    .hand-east {
      margin-top: variables.$card-height;
      margin-bottom: variables.$card-height;
    }
  }

  .center-frame-container {
    position: relative;
  }

  .bidding-center-panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .bidding-center-panel-fake {
    position: absolute;
    top: 0;
    width: 100%;

    .frame {
      // outline: none;
    }

    .center-frame-label {
      display: none;
    }
  }

  .trick-view {
    width: 100%;
    aspect-ratio: 1;
  }

  .center-frame {
    min-height: 0;
    aspect-ratio: 1;
    display: grid;
    overflow: hidden;
  }
}

.debug {
  .hand-north {
    background-color: lightblue;
  }

  .hand-east {
    background-color: lightgoldenrodyellow;
  }

  .hand-south {
    background-color: lightgreen;
  }

  .hand-west {
    background-color: lightpink;
  }
}


.end-text {
  color: variables.$primary;
  position: absolute;

  font-size: 5vh;

  top: 50%;
  right: 0;
  left: 0;

  transform: translateY(-50%);

  text-align: center;
  vertical-align: middle;
}


.filler {
  flex: 1;
}

.debug {
  .filler {
    background-color: red;
  }
}
</style>
