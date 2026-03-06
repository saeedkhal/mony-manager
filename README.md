# مول عموله — Money Manager Mobile

A React Native (Expo) app for managing shop finances: clients, workers, suppliers, general expenses, and zakat calculation. Built for RTL (Arabic) with fiscal-year support.

## Features

- **Dashboard** — Net profit, income/expense stats, monthly charts, client profitability summary
- **Clients** — Add clients, track income & expenses per project, view transaction history
- **Workers (الصنايعية)** — Manage workers, assign expenses (مصنعية), view totals per fiscal year
- **Suppliers (الموردين)** — Manage suppliers, link purchases to clients (قماش، خشب، etc.)
- **General expenses** — Track rent, utilities, wages, and other overhead by category
- **Zakat (الزكاة)** — Calculate zakat based on net profit and configurable nisab (نصاب)

Data is stored locally with AsyncStorage and scoped by fiscal year.

## Tech Stack

- **Expo** ~54
- **React** 19, **React Native** 0.81
- **react-native-chart-kit** — Bar charts
- **react-native-safe-area-context** — Safe areas
- **@react-native-async-storage/async-storage** — Persistence

## Project Structure

```
├── App.js                 # App shell, provider, layout
├── index.js               # Entry (Expo + SafeAreaProvider)
├── context/
│   └── AppContext.js      # Global state & actions
├── hooks/
│   └── useAppData.js      # Derived data (fyClients, totals, charts)
├── screens/
│   ├── MainContent.js     # Tab router
│   ├── Dashboard.js
│   ├── Clients.js
│   ├── Workers.js
│   ├── Suppliers.js
│   ├── General.js
│   └── Zakat.js
├── components/
│   ├── Header.js
│   ├── HeaderActions.js
│   ├── Drawer.js
│   ├── Modal.js
│   └── Modals.js         # All form modals
├── styles/
│   └── AppStyles.js      # Shared styles
├── constants/            # CURRENCY, categories, labels, NAV_ITEMS
└── utils/
    ├── helpers.js        # fmt, fiscal year helpers
    └── storage.js        # initState, saveState
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Expo Go app on your device (or Android/iOS simulator)

### Install

```bash
npm install
```

### Run

```bash
npm start
```

Then scan the QR code with Expo Go, or press `a` for Android / `i` for iOS in the terminal.

Other scripts:

- `npm run android` — Open on Android
- `npm run ios` — Open on iOS
- `npm run web` — Open in browser

## License

0BSD
