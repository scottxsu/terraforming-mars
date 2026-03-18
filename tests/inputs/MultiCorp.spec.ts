import {expect} from 'chai';
import {testGame} from '../TestGame';
import {SelectInitialCards} from '../../src/server/inputs/SelectInitialCards';
import {TestPlayer} from '../TestPlayer';
import {CardName} from '../../src/common/cards/CardName';
import {ICorporationCard} from '../../src/server/cards/corporation/ICorporationCard';
import {corporationCardsFromJSON, preludesFromJSON, cardsFromJSON} from '../../src/server/createCard';
import {toName} from '../../src/common/utils/utils';
import {SelectCard} from '../../src/server/inputs/SelectCard';
import {cast} from '../TestingUtils';
import {Phase} from '../../src/common/Phase';
import {IGame} from '../../src/server/IGame';
import {SECONDARY_CORP_COST} from '../../src/common/constants';

describe('Multi-Corp', () => {
  describe('SelectInitialCards with multiple corps', () => {
    let player: TestPlayer;
    let corp: ICorporationCard | undefined = undefined;

    function cb(corporation: ICorporationCard) {
      corp = corporation;
      return undefined;
    }

    it('Selects 2 corporations with corporationsToKeep=2', () => {
      [/* game */, player] = testGame(1, {preludeExtension: true, corporationsToKeep: 2, startingCorporations: 4});
      player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION, CardName.THARSIS_REPUBLIC, CardName.TERACTOR]);
      player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER]);
      player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
      const selectInitialCards = new SelectInitialCards(player, cb);

      selectInitialCards.process({type: 'initialCards', responses: [
        {type: 'card', cards: [CardName.INVENTRIX, CardName.HELION]},
        {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB]},
        {type: 'card', cards: [CardName.ANTS]},
      ]}, player);

      // Main corp is the first selected
      expect(corp!.name).eq(CardName.INVENTRIX);
      // Secondary corps stored
      expect(player.secondaryCorporations.map(toName)).to.have.members([CardName.HELION]);
      expect(player.preludeCardsInHand.map(toName)).to.have.members([CardName.LOAN, CardName.BIOLAB]);
    });

    it('Rejects wrong number of corporations', () => {
      [/* game */, player] = testGame(1, {preludeExtension: true, corporationsToKeep: 2, startingCorporations: 4});
      player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION, CardName.THARSIS_REPUBLIC, CardName.TERACTOR]);
      player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER]);
      player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
      const selectInitialCards = new SelectInitialCards(player, cb);

      expect(() => selectInitialCards.process({type: 'initialCards', responses: [
        {type: 'card', cards: [CardName.INVENTRIX]},
        {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB]},
        {type: 'card', cards: [CardName.ANTS]},
      ]}, player)).to.throw(/Not enough cards selected/);
    });

    it('Discards unselected corporations', () => {
      [/* game */, player] = testGame(1, {preludeExtension: true, corporationsToKeep: 2, startingCorporations: 4});
      player.game.corporationDeck.discardPile.length = 0;
      player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION, CardName.THARSIS_REPUBLIC, CardName.TERACTOR]);
      player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER]);
      player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
      const selectInitialCards = new SelectInitialCards(player, cb);

      selectInitialCards.process({type: 'initialCards', responses: [
        {type: 'card', cards: [CardName.INVENTRIX, CardName.HELION]},
        {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB]},
        {type: 'card', cards: [CardName.ANTS]},
      ]}, player);

      expect(player.game.corporationDeck.discardPile.map(toName)).to.have.members([CardName.THARSIS_REPUBLIC, CardName.TERACTOR]);
    });

    it('Does not inject Merger when using multi-corp', () => {
      [/* game */, player] = testGame(1, {preludeExtension: true, corporationsToKeep: 2, startingCorporations: 4, twoCorpsVariant: true});
      // twoCorpsVariant injects Merger only when NOT using multi-corp
      const hasMerger = player.dealtPreludeCards.some((c) => c.name === CardName.MERGER);
      expect(hasMerger).is.false;
    });

    it('Injects Merger with twoCorpsVariant when corporationsToKeep=1', () => {
      [/* game */, player] = testGame(1, {preludeExtension: true, corporationsToKeep: 1, twoCorpsVariant: true});
      player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION]);
      player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
      // Create SelectInitialCards to trigger Merger injection
      new SelectInitialCards(player, cb);
      const hasMerger = player.dealtPreludeCards.some((c) => c.name === CardName.MERGER);
      expect(hasMerger).is.true;
    });
  });

  describe('Secondary corporation playing', () => {
    let game: IGame;
    let player: TestPlayer;
    let player2: TestPlayer;

    beforeEach(() => {
      [game, player, player2] = testGame(2, {preludeExtension: true, corporationsToKeep: 2, startingCorporations: 4});
    });

    it('Secondary corp is played before preludes', () => {
      player.playCorporationCard(corporationCardsFromJSON([CardName.INVENTRIX])[0]);
      player.secondaryCorporations = corporationCardsFromJSON([CardName.HELION]);
      player.preludeCardsInHand = preludesFromJSON([CardName.LOAN]);
      player.megaCredits = 100;

      player.takeAction();

      // Should prompt to play secondary corp first
      expect(game.phase).eq(Phase.CORPORATIONS);
      const selectCorp = cast(player.getWaitingFor(), SelectCard<ICorporationCard>);
      expect(selectCorp.cards.map(toName)).to.have.members([CardName.HELION]);
    });

    it('Playing secondary corp deducts SECONDARY_CORP_COST', () => {
      player.playCorporationCard(corporationCardsFromJSON([CardName.INVENTRIX])[0]);
      // SaturnSystems: 42 starting MC
      player.secondaryCorporations = corporationCardsFromJSON([CardName.SATURN_SYSTEMS]);
      player.preludeCardsInHand = [];
      player.megaCredits = 100;

      const mcBefore = player.megaCredits;
      player.takeAction();

      // Select corp - auto-pays since only MC available
      player.process({type: 'card', cards: [CardName.SATURN_SYSTEMS]});

      // Player gained starting MC and paid SECONDARY_CORP_COST
      // SaturnSystems has 42 starting MC, payment is 42
      expect(player.megaCredits).eq(mcBefore + 42 - SECONDARY_CORP_COST);
      // Has 2 corps now
      expect(player.playedCards.corporations()).has.length(2);
    });

    it('Secondary corp adds to tableau and gains starting MC net of cost', () => {
      player.playCorporationCard(corporationCardsFromJSON([CardName.INVENTRIX])[0]);
      // Teractor: 60 starting MC, net gain = 60 - 42 = 18
      player.secondaryCorporations = corporationCardsFromJSON([CardName.TERACTOR]);
      player.preludeCardsInHand = [];
      player.megaCredits = 50;

      const mcBefore = player.megaCredits;
      player.takeAction();
      player.process({type: 'card', cards: [CardName.TERACTOR]});

      // Player gains Teractor's 60 MC, pays 42 MC cost
      expect(player.megaCredits).eq(mcBefore + 60 - SECONDARY_CORP_COST);
      // Has 2 corps now
      expect(player.playedCards.corporations()).has.length(2);
    });

    it('Secondary corp fizzles when player cannot afford', () => {
      player.playCorporationCard(corporationCardsFromJSON([CardName.INVENTRIX])[0]);
      // InterplanetaryCinematics: 30 starting MC, net cost = 42 - 30 = 12
      const ic = corporationCardsFromJSON([CardName.INTERPLANETARY_CINEMATICS])[0];
      player.secondaryCorporations = [ic];
      player.preludeCardsInHand = [];
      // Player has 0 MC, can't afford net cost of 12
      player.megaCredits = 0;

      player.takeAction();

      // The corp should have a fizzle warning
      expect(ic.warnings.has('corpFizzle')).is.true;

      // Select it - it should fizzle
      player.process({type: 'card', cards: [CardName.INTERPLANETARY_CINEMATICS]});

      // Fizzled: player gets 15 MC instead
      expect(player.megaCredits).eq(15);
      // Corp was not added to tableau
      expect(player.playedCards.corporations()).has.length(1);
    });

    it('Secondary corp initial action is added to pendingInitialActions', () => {
      player.playCorporationCard(corporationCardsFromJSON([CardName.INVENTRIX])[0]);
      // Tharsis Republic has an initial action
      player.secondaryCorporations = corporationCardsFromJSON([CardName.THARSIS_REPUBLIC]);
      player.preludeCardsInHand = [];
      player.megaCredits = 100;

      const initialActionsBefore = player.pendingInitialActions.length;

      player.takeAction();
      player.process({type: 'card', cards: [CardName.THARSIS_REPUBLIC]});

      // Tharsis Republic has an initial action
      expect(player.pendingInitialActions.length).to.be.greaterThan(initialActionsBefore);
    });

    it('Each player gets dealt correct number of corps with multi-corp', () => {
      expect(game.gameOptions.corporationsToKeep).eq(2);
      expect(player.dealtCorporationCards).has.length(4);
      expect(player2.dealtCorporationCards).has.length(4);
    });

    it('Secondary corp triggers main corp effect', () => {
      // Point Luna draws a card when an Earth tag is played
      player.playCorporationCard(corporationCardsFromJSON([CardName.POINT_LUNA])[0]);
      // Teractor has an Earth tag
      player.secondaryCorporations = corporationCardsFromJSON([CardName.TERACTOR]);
      player.preludeCardsInHand = [];
      player.megaCredits = 100;

      const handSize = player.cardsInHand.length;
      player.takeAction();
      player.process({type: 'card', cards: [CardName.TERACTOR]});

      // Point Luna's effect should have drawn a card from the Earth tag
      expect(player.cardsInHand.length).eq(handSize + 1);
      expect(player.playedCards.corporations()).has.length(2);
    });
  });
});
