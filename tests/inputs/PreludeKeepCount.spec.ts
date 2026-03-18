import {expect} from 'chai';
import {testGame} from '../TestGame';
import {SelectInitialCards} from '../../src/server/inputs/SelectInitialCards';
import {TestPlayer} from '../TestPlayer';
import {CardName} from '../../src/common/cards/CardName';
import {ICorporationCard} from '../../src/server/cards/corporation/ICorporationCard';
import {corporationCardsFromJSON, preludesFromJSON, cardsFromJSON} from '../../src/server/createCard';
import {toName} from '../../src/common/utils/utils';
import {PRELUDE_CARDS_DEALT_PER_PLAYER, PRELUDE_CARDS_KEPT_PER_PLAYER} from '../../src/common/constants';

describe('Prelude Keep Count', () => {
  let player: TestPlayer;
  let corp: ICorporationCard | undefined = undefined;

  function cb(corporation: ICorporationCard) {
    corp = corporation;
    return undefined;
  }

  it('Default: deals 4 preludes, keeps 2', () => {
    const [_game, player] = testGame(1, {preludeExtension: true});
    expect(player.dealtPreludeCards).has.length(PRELUDE_CARDS_DEALT_PER_PLAYER);
  });

  it('Keeps 3 preludes when startingPreludesInHand is 3', () => {
    const [_game, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 3});
    // Deals at least max(4, 3) = 4 preludes
    expect(player.dealtPreludeCards.length).gte(3);
  });

  it('Deals more preludes when startingPreludes increased', () => {
    const [_game, player] = testGame(1, {preludeExtension: true, startingPreludes: 6});
    expect(player.dealtPreludeCards).has.length(6);
  });

  it('startingPreludes is clamped up to startingPreludesInHand', () => {
    const [_game, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 5, startingPreludes: 3});
    // normalization: max(3, 5, 4) = 5 preludes dealt
    expect(player.dealtPreludeCards).has.length(5);
  });

  it('startingPreludes is clamped up to PRELUDE_CARDS_DEALT_PER_PLAYER', () => {
    const [_game, player] = testGame(1, {preludeExtension: true, startingPreludes: 2});
    // normalization: max(2, 2, 4) = 4 preludes dealt
    expect(player.dealtPreludeCards).has.length(PRELUDE_CARDS_DEALT_PER_PLAYER);
  });

  it('SelectInitialCards allows keeping 3 preludes', () => {
    [/* game */, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 3, startingPreludes: 6});
    player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION]);
    player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER, CardName.ACQUIRED_SPACE_AGENCY, CardName.MOHOLE_EXCAVATION]);
    player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
    const selectInitialCards = new SelectInitialCards(player, cb);

    selectInitialCards.process({type: 'initialCards', responses: [
      {type: 'card', cards: [CardName.INVENTRIX]},
      {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB, CardName.DONATION]},
      {type: 'card', cards: [CardName.ANTS]},
    ]}, player);

    expect(corp!.name).eq(CardName.INVENTRIX);
    expect(player.preludeCardsInHand.map(toName)).to.have.members([CardName.LOAN, CardName.BIOLAB, CardName.DONATION]);
  });

  it('SelectInitialCards rejects wrong number of preludes', () => {
    [/* game */, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 3, startingPreludes: 6});
    player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION]);
    player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER, CardName.ACQUIRED_SPACE_AGENCY, CardName.MOHOLE_EXCAVATION]);
    player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
    const selectInitialCards = new SelectInitialCards(player, cb);

    expect(() => selectInitialCards.process({type: 'initialCards', responses: [
      {type: 'card', cards: [CardName.INVENTRIX]},
      {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB]},
      {type: 'card', cards: [CardName.ANTS]},
    ]}, player)).to.throw(/Not enough cards selected/);
  });

  it('Keeps 1 prelude when startingPreludesInHand is 1', () => {
    [/* game */, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 1});
    player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION]);
    player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER]);
    player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
    const selectInitialCards = new SelectInitialCards(player, cb);

    selectInitialCards.process({type: 'initialCards', responses: [
      {type: 'card', cards: [CardName.INVENTRIX]},
      {type: 'card', cards: [CardName.LOAN]},
      {type: 'card', cards: [CardName.ANTS]},
    ]}, player);

    expect(player.preludeCardsInHand.map(toName)).to.have.members([CardName.LOAN]);
  });

  it('Unkept preludes are discarded', () => {
    [/* game */, player] = testGame(1, {preludeExtension: true, startingPreludesInHand: 2, startingPreludes: 6});
    player.game.preludeDeck.discardPile.length = 0;
    player.dealtCorporationCards = corporationCardsFromJSON([CardName.INVENTRIX, CardName.HELION]);
    player.dealtPreludeCards = preludesFromJSON([CardName.LOAN, CardName.BIOLAB, CardName.DONATION, CardName.SUPPLIER, CardName.ACQUIRED_SPACE_AGENCY, CardName.MOHOLE_EXCAVATION]);
    player.dealtProjectCards = cardsFromJSON([CardName.ANTS]);
    const selectInitialCards = new SelectInitialCards(player, cb);

    selectInitialCards.process({type: 'initialCards', responses: [
      {type: 'card', cards: [CardName.INVENTRIX]},
      {type: 'card', cards: [CardName.LOAN, CardName.BIOLAB]},
      {type: 'card', cards: [CardName.ANTS]},
    ]}, player);

    expect(player.preludeCardsInHand.map(toName)).to.have.members([CardName.LOAN, CardName.BIOLAB]);
    expect(player.game.preludeDeck.discardPile.map(toName)).to.have.members([
      CardName.DONATION, CardName.SUPPLIER, CardName.ACQUIRED_SPACE_AGENCY, CardName.MOHOLE_EXCAVATION,
    ]);
  });

  it('Multiple players each get correct number of preludes', () => {
    const [game, player1, player2] = testGame(2, {preludeExtension: true, startingPreludesInHand: 3, startingPreludes: 6});
    expect(player1.dealtPreludeCards.length).gte(6);
    expect(player2.dealtPreludeCards.length).gte(6);
    expect(game.gameOptions.startingPreludesInHand).eq(3);
  });
});
