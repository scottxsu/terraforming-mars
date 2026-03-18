# Terraforming Mars – Copilot Reference

## Project Overview

This is a full-stack TypeScript implementation of the board game **Terraforming Mars**. It includes a Node.js HTTP server, a Vue 3 browser client, and a comprehensive test suite. The game supports 1–5 players (up to 8 with expansions), all official expansions, and multiple board maps.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.5+ (strict mode, ES2021 target) |
| Server | Node.js (16–22) with raw `http`/`https` — **no Express** |
| Client | Vue 3 (Options API via `defineComponent`) |
| Bundler | Webpack 5 (`ts-loader`, `vue-loader`, `less-loader`) |
| CSS | Less → CSS (compiled to `build/styles.css`) |
| Testing | Mocha + Chai (server), Mochapack + `@vue/test-utils` (client) |
| Linting | ESLint 9 flat config + `@typescript-eslint` + `eslint-plugin-vue` |
| Database | SQLite (default), PostgreSQL (optional), LocalFilesystem, LocalStorage |
| Metrics | `prom-client` (Prometheus) |
| Docker | Multi-stage Alpine build, port 8080 |

## Directory Structure

```
src/
├── server/          # Game engine + HTTP server
│   ├── server.ts              # Entry point: creates HTTP(S) server
│   ├── server/requestProcessor.ts  # Route dispatch (maps URL paths → Handlers)
│   ├── routes/                # One Handler subclass per API endpoint
│   ├── Game.ts                # Core game state machine (1815+ lines)
│   ├── IGame.ts               # Game interface
│   ├── Player.ts              # Player logic (1900+ lines)
│   ├── IPlayer.ts             # Player interface
│   ├── cards/                 # All card implementations (see Card System below)
│   ├── behavior/              # Declarative behavior execution engine
│   ├── deferredActions/       # Queued async game actions
│   ├── inputs/                # Player input types (SelectCard, OrOptions, etc.)
│   ├── database/              # Database abstraction (IDatabase, SQLite, PostgreSQL, etc.)
│   ├── boards/                # Mars board variants (Tharsis, Hellas, Elysium, etc.)
│   ├── milestones/            # Milestone implementations
│   ├── awards/                # Award implementations
│   ├── colonies/              # Colony expansion logic
│   ├── turmoil/               # Turmoil expansion (parties, global events, delegates)
│   ├── moon/                  # Moon expansion
│   ├── pathfinders/           # Pathfinders expansion
│   ├── underworld/            # Underworld expansion
│   ├── ares/                  # Ares expansion (hazards)
│   ├── venusNext/             # Venus Next expansion
│   ├── models/                # Server→Client model transformations (ServerModel.ts)
│   ├── game/                  # GameOptions, victory point calculation
│   ├── player/                # Player sub-systems (Tags, Production, Stock, Colonies)
│   ├── logs/                  # Log message building
│   ├── auth/                  # Session/auth types
│   └── tools/                 # Build-time tools (card rendering export, gzip, etc.)
├── client/          # Vue 3 browser application
│   ├── main.ts                # App bootstrap (createApp, i18n, service worker)
│   ├── components/            # Vue SFCs and .ts components
│   │   ├── App.ts             # Root component, screen router
│   │   ├── PlayerHome.vue     # Main player game view
│   │   ├── card/              # Card rendering components (Card.vue, CardContent, etc.)
│   │   ├── board/             # Board rendering
│   │   ├── create/            # Game creation form
│   │   ├── overview/          # Player overview panels
│   │   ├── Select*.vue        # Player input components (mirror server inputs/)
│   │   └── ...
│   ├── cards/                 # Client-side card helpers
│   ├── colonies/              # Colony UI helpers
│   ├── turmoil/               # Turmoil UI helpers
│   ├── utils/                 # Preferences, HTTP fetching, etc.
│   ├── plugins/               # Vue plugins (i18n)
│   └── directives/            # Vue directives (i18n, trim whitespace)
├── common/          # Shared types between server and client
│   ├── constants.ts           # Game constants (costs, limits, global parameter bounds)
│   ├── Resource.ts            # 6 resource types (megacredits, steel, titanium, plants, energy, heat)
│   ├── Phase.ts               # Game phases (INITIALDRAFTING → RESEARCH → ACTION → PRODUCTION → END)
│   ├── Types.ts               # Branded ID types (PlayerId, GameId, SpectatorId, SpaceId)
│   ├── Units.ts               # Resource unit bundle
│   ├── cards/                 # Card enums/types (CardName, CardType, Tag, GameModule)
│   ├── models/                # View models sent to client (PlayerModel, GameModel, SpaceModel, etc.)
│   ├── input/                 # PlayerInputType enum
│   ├── inputs/                # Input/response types (Payment, InputResponse)
│   ├── app/paths.ts           # All API URL paths (shared between server routing and client fetching)
│   ├── boards/                # Board enums (BoardName, SpaceType, SpaceBonus)
│   ├── colonies/              # Colony names
│   ├── turmoil/               # Turmoil types (PartyName, GlobalEventName, etc.)
│   ├── logs/                  # Log message types
│   ├── ma/                    # Milestone/Award names and types
│   ├── game/                  # NewGameConfig, VictoryPointsBreakdown
│   └── utils/                 # Shared utilities (Random, utils.ts)
├── locales/         # i18n translation JSON files (20+ languages)
└── styles/          # Less stylesheets
tests/               # Test suite (mirrors src/server structure)
assets/              # Static assets (images, HTML)
```

## Key Concepts

### Game Lifecycle / Phases

The game progresses through phases defined in `src/common/Phase.ts`:

1. **INITIALDRAFTING** – Players draft initial project cards (and preludes if enabled)
2. **PRELUDES** – Players play prelude cards
3. **CEOS** – Players play CEO cards (if CEO expansion enabled)
4. **RESEARCH** – Players buy cards for the generation
5. **DRAFTING** – Official draft variant card selection
6. **ACTION** – Players take turns performing 1–2 actions each
7. **PRODUCTION** – Energy → heat, production yields
8. **SOLAR** – World Government Terraforming (solo/special)
9. **INTERGENERATION** – Cleanup, turn order
10. **END** – Game over, final scoring

### Card System

Cards are the heart of the game. The architecture uses a **declarative behavior system** to minimize per-card code.

#### Card Class Hierarchy

- **`Card`** (`src/server/cards/Card.ts`) – Abstract base class. Stores properties in a static `Map<CardName, InternalProperties>` cache for memory efficiency. Delegates play logic to the `BehaviorExecutor` and provides `bespokePlay`/`bespokeCanPlay` hooks for custom logic.
- **`ActionCard`** extends `Card` – For cards with repeatable actions (defined via `action: Behavior`). Provides `bespokeAction`/`bespokeCanAct` hooks.
- **Card types**: `EVENT`, `ACTIVE`, `AUTOMATED`, `PRELUDE`, `CORPORATION`, `CEO`, `STANDARD_PROJECT`, `STANDARD_ACTION`

#### Behavior System (`src/server/behavior/`)

Most card effects are declared as a `Behavior` object rather than imperative code:

```typescript
// Example: Asteroid card
behavior: {
  stock: {titanium: 2},        // Gain 2 titanium
  global: {temperature: 1},     // Raise temperature 1 step
  removeAnyPlants: 3,           // Remove up to 3 plants from any player
}
```

- **`Behavior.ts`** – Type definition for all declarable effects (production changes, resource gains, global parameter raises, tile placement, drawing cards, etc.)
- **`Executor.ts`** – Implements `BehaviorExecutor` interface. `canExecute()` checks feasibility, `execute()` applies effects, `onDiscard()` reverses persistent effects.
- **`Counter.ts`** – Evaluates `Countable` expressions (static numbers or dynamic counts based on tags, resources, etc.)
- Registered globally via `globalInitialize.ts` → `registerBehaviorExecutor(new Executor())`

When a card needs custom logic beyond what `Behavior` can express, override `bespokePlay()` / `bespokeCanPlay()`.

#### Card Manifests & Registration

- Each expansion has a `CardManifest` (e.g., `BASE_CARD_MANIFEST`, `VENUS_CARD_MANIFEST`)
- All manifests are collected in `src/server/cards/AllManifests.ts` → `ALL_MODULE_MANIFESTS`
- `ModuleManifest` contains: `projectCards`, `corporationCards`, `preludeCards`, `ceoCards`, `standardProjects`, `standardActions`, `globalEvents`, `cardsToRemove`

#### Card Rendering

Card visual rendering metadata is defined via `CardRenderer.builder()` in each card's `metadata` property. The client uses Vue components in `src/client/components/card/` to render cards based on this metadata.

### Deferred Actions (`src/server/deferredActions/`)

Many game effects require player input or must be resolved in a specific order. These are modeled as `DeferredAction` objects queued in `game.deferredActions` (a `DeferredActionsQueue`).

Common deferred actions: `PlaceOceanTile`, `SelectPaymentDeferred`, `DrawCards`, `AddResourcesToCard`, `DecreaseAnyProduction`, `RemoveAnyPlants`, `BuildColony`, `SendDelegateToArea`

Each has a `Priority` that determines execution order.

### Player Inputs (`src/server/inputs/`)

When a player must make a choice, the server creates a `PlayerInput` object:

- `SelectCard` – Choose card(s) from a list
- `SelectSpace` – Choose a board space
- `SelectPlayer` – Choose a player
- `SelectPayment` – Choose how to pay
- `OrOptions` – Choose one of several options
- `AndOptions` – Must resolve all sub-inputs
- `SelectAmount`, `SelectColony`, `SelectDelegate`, `SelectParty`, etc.

These are serialized to `PlayerInputModel` and sent to the client, which renders the matching Vue component (`SelectCard.vue`, `SelectSpace.vue`, etc.).

### Database Layer (`src/server/database/`)

- **`IDatabase`** – Interface for game persistence
- **`Database`** – Singleton factory; selects implementation based on environment variables:
  - `POSTGRES_HOST` → PostgreSQL
  - `LOCAL_FS_DB` → LocalFilesystem (JSON files)
  - `LOCAL_STORAGE_DB` → LocalStorage
  - Default → SQLite
- **`GameLoader`** – Manages in-memory game cache, loads/saves via `IDatabase`
- Games are serialized as JSON (`SerializedGame`, `SerializedPlayer`, `SerializedCard`)

### Server & Routing

- **No web framework** – raw Node.js `http.createServer()`
- `src/server/server/requestProcessor.ts` maps URL paths (from `src/common/app/paths.ts`) to `Handler` subclasses
- Each `Handler` in `src/server/routes/` implements `get()`, `post()`, or `put()` methods
- Key routes:
  - `POST /api/creategame` → `ApiCreateGame`
  - `GET /api/player?id=...` → `ApiPlayer` (returns `PlayerViewModel`)
  - `GET /api/waitingfor?id=...` → `ApiWaitingFor` (long-poll for game state changes)
  - `POST /player/input` → `PlayerInput` (submit player decisions)
  - `GET /api/game?id=...` → `ApiGame`

### Client Architecture

- Vue 3 app with **Options API** (`defineComponent`)
- `App.ts` acts as a simple screen router (no vue-router); switches between screens like `'player-home'`, `'game-end'`, `'create-game-form'`, etc.
- `PlayerHome.vue` is the main gameplay view
- `PlayerInputFactory.vue` dynamically renders the correct input component based on `PlayerInputModel.type`
- Path alias: `@/*` maps to `./src/*` (configured in tsconfig + webpack)

### Expansions Supported

| Expansion | Module Key | Server Directory |
|-----------|-----------|-----------------|
| Corporate Era | `corpera` | (base cards) |
| Venus Next | `venus` | `venusNext/` |
| Colonies | `colonies` | `colonies/` |
| Prelude | `prelude` | `cards/prelude/` |
| Prelude 2 | `prelude2` | `cards/prelude2/` |
| Turmoil | `turmoil` | `turmoil/` |
| Ares | `ares` | `ares/` |
| Moon | `moon` | `moon/` |
| Pathfinders | `pathfinders` | `pathfinders/` |
| CEOs | `ceo` | `cards/ceos/` |
| Promo | `promo` | `cards/promo/` |
| Community | `community` | `cards/community/` |
| Star Wars | `starwars` | `cards/starwars/` |
| Underworld | `underworld` | `underworld/` |

### Board Maps

Defined in `src/server/boards/`: Tharsis, Hellas, Elysium, Utopia Planitia, Vastitas Borealis (+ Novus), Terra Cimmeria (+ Novus), Amazonis, Arabia Terra, Hollandia.

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build              # Full build (CSS + server + client)
npm run build:server       # Server only (tsc)
npm run build:client       # Client only (webpack, requires build:server first for card rendering data)
npm run build:test         # Compile tests
```

### Run

```bash
npm start                  # Production: node build/src/server/server.js
npm run dev:server         # Dev: ts-node-dev with auto-restart
npm run dev:client         # Dev: webpack --watch
```

The server runs on port **8080** by default.

### Test

```bash
npm test                   # All tests (server + client)
npm run test:server        # Server tests (ts-mocha)
npm run test:client        # Client/Vue tests (mochapack)
npm run test:integration   # Integration tests (database, etc.)
```

### Lint

```bash
npm run lint               # All: server + i18n + client
npm run lint:server        # ESLint on src/ and tests/
npm run lint:client        # vue-tsc type checking
npm run lint:fix           # Auto-fix ESLint issues
```

### Environment Variables

- `POSTGRES_HOST` – Use PostgreSQL instead of SQLite
- `LOCAL_FS_DB` – Use local filesystem JSON storage
- `LOCAL_STORAGE_DB` – Use browser-like local storage
- `KEY_PATH` / `CERT_PATH` – Enable HTTPS
- `THROW_STATE_ERRORS` – Throw on state errors (debugging)
- `DISCORD_ADMIN_USER_IDS` – Semicolon-separated Discord admin IDs

## Testing Patterns

### Creating a Test Game

```typescript
import {testGame} from '../TestGame';
import {TestPlayer} from '../TestPlayer';

// Create a 2-player game; returns [game, player1, player2, ...]
const [game, player, player2] = testGame(2);

// With options:
const [game, player] = testGame(1, {turmoilExtension: true});
```

`testGame()` automatically:
- Skips initial card selection (unless `skipInitialCardSelection: false`)
- Disables Ares hazards when Ares is enabled (non-deterministic)
- Returns `TestPlayer` instances with helper methods

### TestPlayer Helpers

- `player.popWaitingFor()` – Get and clear the pending `PlayerInput`
- `player.popWaitingFor2()` – Get `[waitingFor, callback]` pair
- `player.tagsForTest` – Override tag counts for testing
- Static factories: `TestPlayer.BLUE`, `TestPlayer.RED`, etc.

### Common Test Utilities (`TestingUtils.ts`)

- `runAllActions(game)` – Flush the deferred actions queue
- `cast(obj, Class)` – Assert type and return typed value
- `churn(input, player)` – Execute input + flush deferred actions, return next waiting input
- `setTemperature(game, n)` / `setOxygenLevel(game, n)` / `setVenusScaleLevel(game, n)`
- `maxOutOceans(player)` / `addOcean(player)` / `addCity(player)` / `addGreenery(player)`
- `setRulingParty(game, partyName)` – Set turmoil ruling party
- `testRedsCosts(cb, player, mc, delta)` – Verify Reds ruling policy cost behavior
- `fakeCard(attrs)` – Create a minimal fake card for testing
- `forceGenerationEnd(game)` – Skip to next generation
- `finishGeneration(game)` – Properly end a generation (all players pass)

### Test File Conventions

- Test files are named `*.spec.ts` and mirror the source structure under `tests/`
- Card tests go in `tests/cards/<expansion>/<CardName>.spec.ts`
- Use `describe('CardName', ...)` with `beforeEach` for setup
- Import from `../../TestGame`, `../../TestPlayer`, `../../TestingUtils`

## Coding Conventions

### Card Implementation Checklist

1. Create card class in `src/server/cards/<expansion>/<CardName>.ts`
2. Add `CardName` entry to `src/common/cards/CardName.ts`
3. Register in the expansion's card manifest (e.g., `BaseCardManifest`)
4. Prefer declarative `behavior` over custom `bespokePlay()` code
5. Use `CardRenderer.builder()` for visual metadata
6. Write tests in `tests/cards/<expansion>/<CardName>.spec.ts`

### Style Guidelines

- Single quotes, semicolons required, trailing commas in multiline
- No unused locals/parameters (strict TypeScript)
- `readonly` arrays for game collections where possible
- Interfaces prefixed with `I` (e.g., `IGame`, `IPlayer`, `ICard`)
- Use `@/*` path alias for imports from `src/`
- Prefer `const` and functional patterns; avoid `any`

### Important Patterns

- **Static card property caching**: `Card` constructor stores properties in a global `Map<CardName, InternalProperties>` — card instances are lightweight.
- **Deferred actions over return values**: Complex effects should use `game.defer(new SomeAction(...))` rather than returning `PlayerInput` from `play()`.
- **Server model transformation**: `ServerModel.ts` converts server `IGame`/`IPlayer` state into client-consumable view models.
- **Common types shared**: Types in `src/common/` are used by both server and client — never import server code from client or vice versa.

### Action Lifecycle & Deferred Actions

The `takeAction()` method in `Player.ts` is the central loop for player turns. Understanding its execution order is critical:

1. **Deferred actions run first**: At the top of `takeAction()`, any queued deferred actions are processed before anything else.
2. **Phase-specific blocks**: Preludes → CEOs → ACTION phase checks → Initial actions → Regular actions.
3. **`setWaitingFor` + callback**: Each action presentation calls `setWaitingFor(input, callback)`. When the player submits input, `process()` runs the card effects, then calls the callback.
4. **`runWhenEmpty` wrapper**: Some callbacks use `this.runWhenEmpty(cb)` to delay execution until all deferred actions are resolved. This ensures counters like `actionsTakenThisGame` only increment after all effects of an action are complete.

**Execution order for a regular action**:
```
process() → card effects execute → deferred actions queued
         → callback fires → [runWhenEmpty waits for deferred actions]
         → incrementActionsTaken() → takeAction() → present next action
```

**Key timing rule**: Card effects and their deferred consequences run BEFORE `incrementActionsTaken()`. This means `actionsTakenThisGame` is stable (unchanged) during the entire execution of an action, including its deferred resolution. Cards like Suitable Infrastructure rely on this stability.

### Custom Game Options (Fork Additions)

This fork adds several custom game options beyond the base game:

- **`startingPreludesInHand`**: Number of preludes to keep (default 2, configurable)
- **`corporationsToKeep`**: Number of corporations to keep during initial selection (default 1; >1 enables multi-corp mode)
- **`corporationsDraftVariant`**: When true and `corporationsToKeep > 1`, corporations are drafted after preludes
- **Secondary Corporation Phase** (`Phase.CORPORATIONS`): When multi-corp is enabled, players play secondary corps one at a time (like preludes) between research and prelude phases. Each costs 42 MC. Unaffordable corps fizzle (+15 MC, like preludes).
- **Corporation Draft**: Pick-1-pass-rest mechanic, same as prelude draft but passes in the opposite direction.
