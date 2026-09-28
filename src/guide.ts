import zhGuide from "./guide-zh.json";

// The visitor's guide, read from the scroll on the harbour quay (or the help dialog).
// Each chapter is a title and a few blocks: a paragraph, or a list of [term, explanation]
// pairs. The Traditional Chinese text lives in guide-zh.json with the same shape.
export type GuideBlock = string | [string, string][];
export type GuideChapter = { id: string; title: string; blocks: GuideBlock[] };
type Guide = { title: string; subtitle: string; contents: string; close: string; chapters: GuideChapter[] };

const en: Guide = {
  title: "The Visitor's Guide",
  subtitle: "Everything the city can do, unrolled in one place.",
  contents: "Contents",
  close: "Roll up the scroll",
  chapters: [
    {
      id: "welcome",
      title: "Welcome to the city of words",
      blocks: [
        "This is a walled seaside town where every word hangs as a painting: 2,538 of them, from the harbour quay to the last lane of the Old Town. Each painting was made for its word, and beside it you'll find a meaning and an example sentence.",
        "There is no right route and no timer. Walk, look, open whatever catches your eye. Everything you discover is kept in this browser, so you can pick up where you left off next time.",
      ],
    },
    {
      id: "moving",
      title: "Getting around",
      blocks: [
        [
          ["Walk", "W A S D or the arrow keys. Hold W to speed up gradually; Shift gives an instant boost. Q and E turn."],
          ["Look", "Drag with the mouse, or swipe on a touch screen."],
          ["On a phone", "Use the on-screen arrows at the bottom; hold forward to go faster."],
          ["The map", "The map button shows where you are, every landmark and house, and jumps you to any of them. Next stop walks the landmarks in order; Next root walks the root houses."],
          ["Guided tour", "Take a guided tour visits every painting one after another. Tour from here starts at the first painting you haven't seen nearby."],
          ["Language", "The header switches between Chinese and English. A word's card can also show Japanese, Korean, Vietnamese and Thai translations."],
          ["Day and evening", "The sun and moon button changes the light. After dusk, lamps glow, stars come out and your learned words shine in their frames."],
        ],
      ],
    },
    {
      id: "word",
      title: "Getting to know a word",
      blocks: [
        "Click any painting to open its card. You'll hear the word straight away.",
        [
          ["Listen", "Hear the word, its example, or Play all for both. Choose 0.75×, 1× or 1.25× speed."],
          ["Read", "Meaning, example, pronunciation, translations, collocations, synonyms and other senses."],
          ["View artwork", "See the full painting with its title and medium."],
          ["YouTube", "The small YouTube icon under a painting shows the word spoken in real videos."],
          ["Word roots", "Words from a root family show how they are built, such as sub + port, with links to their relatives."],
          ["Learned", "Tick the checkbox, in the card or on the frame itself, once you know a word. Unlearned words keep a bright gold frame; learned ones turn to quiet wood with a green tick."],
          ["My words", "Save favourites to your own collection, which you can search and filter."],
          ["Postcard", "Send any word home as a postcard: the painting, the word, its meaning and a dated postmark."],
        ],
      ],
    },
    {
      id: "city",
      title: "The lay of the land",
      blocks: [
        "You arrive on the Harbour Quay, facing the sea gate. The Belvedere's pergola is at the quay's western end, and the Harbour Mole runs out to the lighthouse.",
        "Through the gate is the Gate Square with its fountain, the Town Hall and the Inn Courtyard. The arcaded Corso leads north, past the City Park and the Market Square, to the Cathedral Square: the Palazzo to the west, the Guildhall to the east, the domed Cathedral to the north and the lantern-lit Cistern beside it.",
        "Beyond the cathedral lies the Old Town: a canal street, avenues and twenty-five lanes of townhouses. Every house is a small exhibition of two to six words.",
        [
          ["Root houses", "One word root and its family. The floor plaque explains the root and where it comes from."],
          ["Theme houses", "Words that belong together, such as travel or money."],
          ["Word-family houses", "The verb, noun and adjective forms of one stem."],
          ["Level lanes", "The remaining words, six to a house, by level."],
        ],
        "The Bell Tower closes the canal to the north, and the Observatory stands on its hill beyond the walls.",
      ],
    },
    {
      id: "goals",
      title: "Places you can finish",
      blocks: [
        "Every landmark and every house is a small goal. The progress card shows the place you're in, with one dot per word, above your total for the whole city.",
        [
          ["Explored", "Open every painting in a place. Explored houses light their door lanterns and are outlined in gold on the map."],
          ["Mastered", "Mark every word in a place as learned. Mastered houses earn gold stars beside their sign."],
          ["The album", "Every painting belongs to one of 76 art styles. The album collects them, from one-of-a-kind pieces to long series; an empty frame walks you to where the missing painting hangs."],
        ],
      ],
    },
    {
      id: "daily",
      title: "Something new every day",
      blocks: [
        [
          ["Today's walk", "Five paintings to find, marked with floating gold stars in the city and on the map. Find all five to keep your daily streak."],
          ["The golden painting", "One painting somewhere in the city shimmers gold, with sparkles circling its frame. It only counts if you open it in the city itself. Today's walk offers three hints if you need them: the kind of place, the word's meaning, and finally its exact spot."],
          ["Lost labels", "Once you've found a dozen words, the wind blows a few word labels away each day. The painting shows ? ? ?; click it and choose which word belongs before its card opens."],
        ],
      ],
    },
    {
      id: "neighbours",
      title: "Your neighbours",
      blocks: [
        "Six people live in the city: Luca on the quay, Ada in the Gate Square, Fern in the park, Ravi at the market, Cleo in the Cathedral Square and Nora on the Old Town promenade. The map shows where to find them.",
        [
          ["Chats", "Walk close and click a neighbour for a three-question chat about words nearby. Hints and retries are always there."],
          ["Favours", "Each neighbour can ask for three paintings, described only by their meaning. Open them in the city, then bring them back. A heart chip on screen keeps track and walks you back."],
          ["Friendship", "Every favour fills a friendship heart. A first finished favour leaves a gift beside the neighbour, and Luca's boat sets sail round the harbour."],
        ],
      ],
    },
    {
      id: "games",
      title: "Games in the streets",
      blocks: [
        "The games button opens six short activities, played with the paintings around you. Each one earns a stamp in your passport, one per game per place.",
        [
          ["Curator's Quest", "Read a meaning clue and find the matching painting."],
          ["Restore the Labels", "Put the missing word labels back on their paintings."],
          ["Listen and Step", "Hear a word, then step onto its tile on the floor."],
          ["Build a Word Family", "Assemble a word from its parts, then find its painting."],
          ["Market Missions", "Help the market's wooden stallholders with what they need."],
          ["Memory Walk", "Study a few paintings, then recall them with the labels hidden."],
        ],
        "Some games find you on their own:",
        [
          ["Street challenges", "Walking through an open square, three word tiles may appear on the ground ahead with a meaning at the top of the screen. Step on the right one, click it or press its button. You can say Not now, or turn them off (and back on in the journal)."],
          ["Cistern echoes", "Step down into the Cistern and a word comes back to you through the stone echo. Pick it from four choices or click its painting. Three rounds a set."],
          ["Word constellations", "In the evening, your six most recently learned words appear as constellations in the sky. Click one for a quick review."],
        ],
      ],
    },
    {
      id: "review",
      title: "Words that come back",
      blocks: [
        "A word you miss in a chat, game, challenge or lost label joins your revisit list. From the next day on, chats and games ask those words first. Answer a word right on two different days and it leaves the list.",
        "The collection's To revisit filter shows the whole list, and today's walk links to it.",
      ],
    },
    {
      id: "journal",
      title: "Your journal and passport",
      blocks: [
        "The journal gathers your story in the city: streak, explored and mastered places, golden paintings found, challenges won, echo sets and friendships. The passport holds your game stamps.",
        "Everything stays in this browser on this device. It is not uploaded anywhere and does not sync between devices.",
      ],
    },
    {
      id: "sound",
      title: "Sound and comfort",
      blocks: [
        [
          ["Ambience", "Turn on the city's sound: waves on the quay, wind, the fountain, birdsong in the park, the market's murmur, bells and cistern drips. It follows you as you walk and quiets whenever a word is spoken."],
          ["Effects", "Little chimes for discoveries, answers and stamps. The Effects switch turns them off."],
          ["Reduced motion", "If your device asks for reduced motion, the city keeps still and the celebrations stay calm."],
        ],
      ],
    },
    {
      id: "tips",
      title: "A few tips",
      blocks: [
        [
          ["Stuck?", "Open the map and pick a landmark, or press Next stop."],
          ["Short on time?", "Do today's walk. Five paintings take a few minutes."],
          ["Want a challenge?", "Pick a root house, open all its paintings, then play Build a Word Family there."],
          ["Lost this scroll?", "It waits on its stand on the harbour quay, and the ? button can always unroll it again."],
        ],
      ],
    },
  ],
};

const zh = zhGuide as Guide;

export const guide = (locale: string) => (locale === "zh_TW" ? zh : en);
