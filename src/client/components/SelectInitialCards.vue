<template>
  <div class="select-initial-cards">
    <confirm-dialog
      message="Continue without buying any project cards?"
      ref="confirmation"
      v-on:accept="confirmSelection" />
    <SelectCard :playerView="playerView" :playerinput="corpCardOption" :showtitle="true" :onsave="noop" v-on:cardschanged="corporationChanged" />
    <div v-if="selectedCorporations.length > 1" class="select-main-corporation">
      <label v-i18n>Main Corporation (funds card purchases):</label>
      <select v-model="mainCorporation" @change="validate">
        <option v-for="corp in selectedCorporations" :key="corp" :value="corp">{{ corp }}</option>
      </select>
    </div>
    <div v-if="playerCanChooseAridor" class="player_home_colony_cont">
      <div v-i18n>These are the colony tiles Aridor may choose from:</div>
      <div class="discarded-colonies-for-aridor">
        <div class="player_home_colony small_colony" v-for="colonyName in playerView.game.discardedColonies" :key="colonyName">
          <colony :colony="getColony(colonyName)" :active="getColony(colonyName).isActive"></colony>
        </div>
      </div>
    </div>
    <SelectCard v-if="hasPrelude" :playerView="playerView" :playerinput="preludeCardOption" :onsave="noop" :showtitle="true" v-on:cardschanged="preludesChanged" />
    <SelectCard v-if="hasCeo" :playerView="playerView" :playerinput="ceoCardOption" :onsave="noop" :showtitle="true" v-on:cardschanged="ceosChanged" />
    <SelectCard :playerView="playerView" :playerinput="projectCardOption" :onsave="noop" :showtitle="true" v-on:cardschanged="cardsChanged" />
    <template v-if="mainCorporation !== undefined">
      <div><span v-i18n>Starting Megacredits:</span> <div class="megacredits">{{getStartingMegacredits()}}</div></div>
      <div v-if="selectedCorporations.length > 1"><span v-i18n>After Secondary Corporations:</span> <div class="megacredits">{{getStartingMegacredits() + getAfterSecondaryCorporations()}}</div></div>
      <div v-if="hasPrelude"><span v-i18n>After Preludes:</span> <div class="megacredits">{{getStartingMegacredits() + getAfterSecondaryCorporations() + getAfterPreludes()}}</div></div>
    </template>
    <div v-if="warning !== undefined" class="tm-warning">
      <label class="label label-error">{{ $t(warning) }}</label>
    </div>
    <!-- :key=warning is a way of validing that the state of the button should change. If the warning changes, or disappears, that's a signal that the button might change. -->
    <AppButton :disabled="!valid" v-if="showsave" @click="saveIfConfirmed" type="submit" :title="playerinput.buttonLabel"/>
  </div>
</template>

<script lang="ts">

import {defineComponent} from '@/client/vue3-compat';

import AppButton from '@/client/components/common/AppButton.vue';
import {getCard, getCardOrThrow} from '@/client/cards/ClientCardManifest';
import {CardName} from '@/common/cards/CardName';
import * as constants from '@/common/constants';
import {PlayerInputModel, SelectCardModel, SelectInitialCardsModel} from '@/common/models/PlayerInputModel';
import {PlayerViewModel} from '@/common/models/PlayerModel';
import SelectCard from '@/client/components/SelectCard.vue';
import ConfirmDialog from '@/client/components/common/ConfirmDialog.vue';
import {getPreferences, Preferences, PreferencesManager} from '@/client/utils/PreferencesManager';
import {Tag} from '@/common/cards/Tag';
import {SelectInitialCardsResponse} from '@/common/inputs/InputResponse';
import {CardType} from '@/common/cards/CardType';
import Colony from '@/client/components/colonies/Colony.vue';
import {ColonyName} from '@/common/colonies/ColonyName';
import {ColonyModel} from '@/common/models/ColonyModel';
import * as titles from '@/common/inputs/SelectInitialCards';
import {sum} from '@/common/utils/utils';


type DataModel = {
  selectedCards: Array<CardName>,
  // End result will be a single CEO, but the player may select multiple while deciding what to keep.
  selectedCeos: Array<CardName>,
  selectedCorporations: Array<CardName>,
  mainCorporation: CardName | undefined,
  selectedPreludes: Array<CardName>,
  valid: boolean,
  warning: string | undefined,
}

type Refs = {
  confirmation: InstanceType<typeof ConfirmDialog>;
};

export default defineComponent({
  name: 'SelectInitialCards',
  props: {
    playerView: {
      type: Object as () => PlayerViewModel,
      required: true,
    },
    playerinput: {
      type: Object as () => SelectInitialCardsModel,
      required: true,
    },
    onsave: {
      type: Function as unknown as () => (out: SelectInitialCardsResponse) => void,
      required: true,
    },
    showsave: {
      type: Boolean,
      required: true,
    },
    showtitle: {
      type: Boolean,
      default: true,
    },
    preferences: {
      type: Object as () => Readonly<Preferences>,
      default: () => PreferencesManager.INSTANCE.values(),
    },
  },
  components: {
    AppButton,
    SelectCard,
    'confirm-dialog': ConfirmDialog,
    Colony,
  },
  data(): DataModel {
    return {
      selectedCards: [],
      selectedCeos: [],
      selectedCorporations: [],
      mainCorporation: undefined,
      selectedPreludes: [],
      valid: false,
      warning: undefined,
    };
  },
  methods: {
    noop() {
      throw new Error('should not be called');
    },
    getAfterSecondaryCorporations() {
      if (this.mainCorporation === undefined) return 0;
      const secondaryCorps = this.selectedCorporations.filter((name) => name !== this.mainCorporation);
      let total = 0;
      // Active corps accumulate as each secondary corp is played in order
      const activeCorps: Array<CardName> = [this.mainCorporation];
      for (const name of secondaryCorps) {
        const corp = getCardOrThrow(name);
        let mc = (corp.startingMegaCredits ?? 0) - constants.SECONDARY_CORP_COST;
        // Check if playing this corp triggers effects from already-active corps
        mc += this.secondaryCorpPlayBonus(name, activeCorps);
        total += mc;
        activeCorps.push(name);
      }
      return total;
    },
    /**
     * Calculates the MC bonus (or penalty) from playing a secondary corporation,
     * accounting for effects from all already-active corps and the played corp's own effect.
     * For example, if Splice is active and the played corp has a microbe tag, Splice grants +2 MC.
     */
    secondaryCorpPlayBonus(playedCorp: CardName, activeCorps: Array<CardName>): number {
      const card = getCardOrThrow(playedCorp);
      let bonus = 0;
      // Check effects from already-active corps AND the corp's own effect on itself
      for (const activeCorp of [...activeCorps, playedCorp]) {
        bonus += this.corpEffectMCBonus(card, activeCorp);
      }
      return bonus;
    },
    /**
     * Returns the MC bonus (or penalty) that a corporation's passive effect grants
     * when a given card (corporation or prelude) is played. Only considers effects
     * that immediately change the player's MC, such as:
     * - Manutech: gain MC equal to MC production increase
     * - Pharmacy Union: lose 4 MC per microbe tag
     * - Splice: gain 2 MC per microbe tag
     * - Sagitta Frontier Services: gain MC based on tag count
     */
    corpEffectMCBonus(card: {tags: ReadonlyArray<string>, productionBox?: {megacredits?: number}, name: CardName}, activeCorp: CardName): number {
      switch (activeCorp) {
      case CardName.MANUTECH:
        return Math.max(0, card.productionBox?.megacredits ?? 0);
      case CardName.THARSIS_REPUBLIC:
        // Cities from preludes — corps don't typically place cities on play
        return 0;
      case CardName.PHARMACY_UNION: {
        const tags = card.tags.filter((tag) => tag === Tag.MICROBE).length;
        return (-4 * tags);
      }
      case CardName.SPLICE: {
        const microbeTags = card.tags.filter((tag) => tag === Tag.MICROBE).length;
        return (2 * microbeTags);
      }
      case CardName.SAGITTA_FRONTIER_SERVICES: {
        const count = card.tags.filter((tag) => tag !== Tag.WILD).length;
        return count === 0 ? 4 : count === 1 ? 1 : 0;
      }
      default:
        return 0;
      }
    },
    getAfterPreludes() {
      return sum(this.selectedPreludes.map((prelude) => {
        const card = getCardOrThrow(prelude);
        const base = card.startingMegaCredits ?? 0;
        return base + this.preludeTotalCorpBonusMC(prelude);
      }));
    },
    /**
     * Total MC bonus a prelude receives from all active corporations' effects
     * (main + all secondary corps) when the prelude is played.
     */
    preludeTotalCorpBonusMC(prelude: CardName): number {
      const allCorps = this.mainCorporation
        ? [this.mainCorporation, ...this.selectedCorporations.filter((c) => c !== this.mainCorporation)]
        : this.selectedCorporations;
      let bonus = 0;
      for (const corp of allCorps) {
        bonus += this.preludeCorpInteractionMC(prelude, corp);
      }
      return bonus;
    },
    /**
     * Returns the MC bonus (or penalty) a specific corporation's effect grants
     * when a given prelude is played. Covers effects like:
     * - Manutech: gain MC equal to the prelude's MC production increase
     * - Tharsis Republic: +3 MC if the prelude places a city
     * - Aphrodite: +2 MC per Venus terraforming step
     * - Polaris: +4 MC per ocean tile placed
     * - Head Start: +2 MC per project card in hand
     */
    preludeCorpInteractionMC(prelude: CardName, corp: CardName): number {
      const card = getCardOrThrow(prelude);
      switch (corp) {
      // For each step you increase the production of a resource ... you also gain that resource.
      case CardName.MANUTECH:
        return Math.max(0, card.productionBox?.megacredits ?? 0);

      // When you place a city tile, gain 3 M€.
      case CardName.THARSIS_REPUBLIC:
        switch (prelude) {
        case CardName.SELF_SUFFICIENT_SETTLEMENT:
        case CardName.EARLY_SETTLEMENT:
        case CardName.STRATEGIC_BASE_PLANNING:
        case CardName.PROJECT_EDEN:
          return 3;
        }
        return 0;

      // When ANY microbe tag is played ... lose 4 M€ or as much as possible.
      case CardName.PHARMACY_UNION:
        const tags = card.tags.filter((tag) => tag === Tag.MICROBE).length;
        return (-4 * tags);

      // when a microbe tag is played, incl. this, THAT PLAYER gains 2 M€,
      case CardName.SPLICE:
        const microbeTags = card.tags.filter((tag) => tag === Tag.MICROBE).length;
        return (2 * microbeTags);

      // Whenever Venus is terraformed 1 step, you gain 2 M€
      case CardName.APHRODITE:
        switch (prelude) {
        case CardName.VENUS_FIRST:
          return 4;
        case CardName.HYDROGEN_BOMBARDMENT:
          return 2;
        }
        return 0;

      // When any player raises any Moon Rate, gain 1M€ per step.
      case CardName.LUNA_FIRST_INCORPORATED:
        switch (prelude) {
        case CardName.FIRST_LUNAR_SETTLEMENT:
        case CardName.CORE_MINE:
        case CardName.BASIC_INFRASTRUCTURE:
          return 1;
        case CardName.MINING_COMPLEX:
          return 2;
        }
        return 0;

      // When you place an ocean tile, gain 4MC
      case CardName.POLARIS:
        switch (prelude) {
        case CardName.AQUIFER_TURBINES:
        case CardName.POLAR_INDUSTRIES:
          return 4;
        case CardName.GREAT_AQUIFER:
          return 8;
        }
        return 0;

      // Gain 2 MC for each project card in hand.
      case CardName.HEAD_START:
        return this.selectedCards.length * 2;

      // Gain 4MC for playing a card with no tags.
      // Gain 1MC for playing a card with 1 tag.
      case CardName.SAGITTA_FRONTIER_SERVICES:
        const count = card.tags.filter((tag) => tag !== Tag.WILD).length;
        return count === 0 ? 4 : count === 1 ? 1 : 0;

      default:
        return 0;
      }
    },
    getStartingMegacredits() {
      if (this.mainCorporation === undefined) {
        return NaN;
      }
      const corpName = this.mainCorporation;
      const corporation = getCardOrThrow(corpName);
      // The ?? 0 is only because IClientCard applies to _all_ cards.

      let starting = corporation.startingMegaCredits ?? 0;
      const cardCost = corporation.cardCost === undefined ? constants.CARD_COST : corporation.cardCost;
      starting -= this.selectedCards.length * cardCost;

      if (corpName === CardName.SAGITTA_FRONTIER_SERVICES) {
        // Effect for playing itself.
        starting += 4;
      }

      return starting;
    },
    saveIfConfirmed() {
      const projectCards = this.selectedCards.filter((name) => getCard(name)?.type !== CardType.PRELUDE);
      let showAlert = false;
      if (this.preferences.show_alerts && projectCards.length === 0) showAlert = true;
      if (showAlert) {
        this.typedRefs.confirmation.show();
      } else {
        this.saveData();
      }
    },
    saveData() {
      const result: SelectInitialCardsResponse = {
        type: 'initialCards',
        responses: [],
      };

      if (this.selectedCorporations.length >= 1) {
        // Ensure main corporation is first in the array
        const corps = this.mainCorporation && this.selectedCorporations.length > 1
          ? [this.mainCorporation, ...this.selectedCorporations.filter((c) => c !== this.mainCorporation)]
          : this.selectedCorporations;
        result.responses.push({
          type: 'card',
          cards: corps,
        });
      }
      if (this.hasPrelude) {
        result.responses.push({
          type: 'card',
          cards: this.selectedPreludes,
        });
      }
      if (this.hasCeo) {
        result.responses.push({
          type: 'card',
          cards: this.selectedCeos,
        });
      }
      result.responses.push({
        type: 'card',
        cards: this.selectedCards,
      });
      this.onsave(result);
    },

    cardsChanged(cards: Array<CardName>) {
      this.selectedCards = cards;
      this.validate();
    },
    ceosChanged(cards: Array<CardName>) {
      this.selectedCeos = cards;
      this.validate();
    },
    corporationChanged(cards: Array<CardName>) {
      this.selectedCorporations = cards;
      // Auto-select main corp
      if (cards.length === 1) {
        this.mainCorporation = cards[0];
      } else if (cards.length > 1 && (this.mainCorporation === undefined || !cards.includes(this.mainCorporation))) {
        this.mainCorporation = cards[0];
      }
      this.validate();
    },
    preludesChanged(cards: Array<CardName>) {
      this.selectedPreludes = cards;
      this.validate();
    },

    calcuateWarning(): boolean {
      // Start with warning being empty.
      this.warning = undefined;
      const corpMin = this.corpCardOption.min;
      if (this.selectedCorporations.length < corpMin) {
        this.warning = corpMin === 1 ? 'Select a corporation' : `Select ${corpMin} corporations`;
        return false;
      }
      if (this.selectedCorporations.length > corpMin) {
        this.warning = 'You selected too many corporations';
        return false;
      }
      if (corpMin > 1 && this.mainCorporation === undefined) {
        this.warning = 'Select a main corporation';
        return false;
      }
      if (this.hasPrelude) {
        const preludeMin = this.preludeCardOption.min;
        if (this.selectedPreludes.length < preludeMin) {
          this.warning = `Select ${preludeMin} preludes`;
          return false;
        }
        if (this.selectedPreludes.length > preludeMin) {
          this.warning = 'You selected too many preludes';
          return false;
        }
      }
      if (this.hasCeo) {
        if (this.selectedCeos.length < 1) {
          this.warning = 'Select 1 CEO';
          return false;
        }
        if (this.selectedCeos.length > 1) {
          this.warning = 'You selected too many CEOs';
          return false;
        }
      }
      if (this.selectedCards.length === 0) {
        this.warning = 'You haven\'t selected any project cards';
        return true;
      }
      return true;
    },
    validate() {
      this.valid = this.calcuateWarning();
    },
    confirmSelection() {
      this.saveData();
    },
    // TODO(kberg): Duplicate of LogPanel.getColony
    getColony(colonyName: ColonyName): ColonyModel {
      return {
        colonies: [],
        isActive: false,
        name: colonyName,
        trackPosition: 0,
        visitor: undefined,
      };
    },
  },
  computed: {
    typedRefs(): Refs {
      return this.$refs as Refs;
    },
    playerCanChooseAridor() {
      return this.playerView.dealtCorporationCards.some((card) => card.name === CardName.ARIDOR);
    },
    hasPrelude() {
      return hasOption(this.playerinput.options, titles.SELECT_PRELUDE_TITLE);
    },
    hasCeo() {
      return hasOption(this.playerinput.options, titles.SELECT_CEO_TITLE);
    },
    corpCardOption() {
      const option = hasOption(this.playerinput.options, titles.SELECT_CORPORATIONS_TITLE)
        ? getOption(this.playerinput.options, titles.SELECT_CORPORATIONS_TITLE)
        : getOption(this.playerinput.options, titles.SELECT_CORPORATION_TITLE);
      if (getPreferences().experimental_ui) {
        option.max = option.cards.length;
      }
      return option;
    },
    preludeCardOption() {
      const option = getOption(this.playerinput.options, titles.SELECT_PRELUDE_TITLE);
      if (getPreferences().experimental_ui) {
        option.max = option.cards.length;
      }
      return option;
    },
    ceoCardOption() {
      const option = getOption(this.playerinput.options, titles.SELECT_CEO_TITLE);
      if (getPreferences().experimental_ui) {
        option.max = option.cards.length;
      }
      return option;
    },
    projectCardOption() {
      return getOption(this.playerinput.options, titles.SELECT_PROJECTS_TITLE);
    },
  },
  mounted() {
    this.validate();
  },
});

function getOption(options: Array<PlayerInputModel>, title: string): SelectCardModel {
  const option = options.find((option) => option.title === title);
  if (option === undefined) {
    throw new Error('invalid input, missing option');
  }
  if (option.type !== 'card') {
    throw new Error('invalid input, Not a SelectCard option');
  }
  return option;
}

function hasOption(options: Array<PlayerInputModel>, title: string): boolean {
  const option = options.find((option) => option.title === title);
  return option !== undefined;
}
</script>
