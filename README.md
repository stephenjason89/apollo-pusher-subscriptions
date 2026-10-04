# apollo-pusher-subscriptions

A modern, configurable Apollo Link for handling GraphQL subscriptions over any Pusher-protocol client, such as [pusher-js](https://github.com/pusher/pusher-js) or the [BunPulse](https://github.com/stephenjason89/bun-pulse) browser client. Built with TypeScript and designed for Laravel Lighthouse, but configurable for any GraphQL server that uses Pusher channels for real-time subscriptions.

## ✨ Features

- 🚀 **Modern Implementation** - Clean Observable patterns, proper TypeScript support
- ⚙️ **Configurable** - Works with Lighthouse out of the box, easily configurable for other GraphQL servers
- 🔧 **Type Safe** - Full TypeScript support with proper interfaces
- 🧹 **Memory Safe** - Proper cleanup of both Apollo and Pusher subscriptions
- 📦 **Lightweight** - Zero dependencies beyond Apollo Client and your Pusher-protocol client
- 🔌 **Client Agnostic** - Works with `pusher-js` or `bun-pulse/client`; anything with `subscribe`/`unsubscribe`
- 🎯 **Battle Tested** - Used in production applications

## 📦 Installation

```bash
npm install apollo-pusher-subscriptions @apollo/client rxjs
# or
yarn add apollo-pusher-subscriptions @apollo/client rxjs
# or
pnpm add apollo-pusher-subscriptions @apollo/client rxjs
```

Then install the realtime client you use: `pusher-js` for Pusher (or any Pusher-compatible server), or `bun-pulse` for its bundled browser client.

## 🚀 Quick Start

### With Laravel Lighthouse (Default)

```typescript
import { ApolloClient, InMemoryCache, ApolloLink } from "@apollo/client/core";
import Pusher from "pusher-js";
import PusherLink from "apollo-pusher-subscriptions";

// Configure Pusher
const pusher = new Pusher("your-app-key", {
  cluster: "your-cluster",
  // ... other Pusher options
});

// Create the Pusher link
const pusherLink = new PusherLink({ pusher });

// Create Apollo Client
const client = new ApolloClient({
  link: ApolloLink.from([
    // ... other links (auth, error handling, etc.)
    pusherLink,
    httpLink, // Your HTTP link should come last
  ]),
  cache: new InMemoryCache(),
});
```

### With BunPulse

[BunPulse](https://github.com/stephenjason89/bun-pulse) ships a browser client that speaks the Pusher protocol without `pusher-js`:

```typescript
import BunPulseClient from "bun-pulse/client";
import PusherLink from "apollo-pusher-subscriptions";

const pusher = new BunPulseClient("your-app-key", {
  wsHost: "ws.example.com",
  forceTLS: true,
  channelAuthorization: { endpoint: "/broadcasting/auth" },
});

const pusherLink = new PusherLink({ pusher });
```

### With Custom GraphQL Server

```typescript
const pusherLink = new PusherLink({
  pusher,
  subscriptionPath: "extensions.subscriptions.channel", // Custom path
  eventName: "graphql-subscription", // Custom event name
  initialDataCondition: (data) => data.data !== null, // Custom condition
});
```

## ⚙️ Configuration Options

```typescript
interface PusherLinkOptions {
  pusher: SubscriptionClient; // Required: pusher-js, bun-pulse/client, or any { subscribe, unsubscribe }
  decompress?: (result: string) => GraphQLResponse; // Optional: Decompression function
  subscriptionPath?: string; // Optional: Path to subscription channel
  eventName?: string; // Optional: Pusher event name
  initialDataCondition?: (data: any) => boolean; // Optional: When to pass initial data
}
```

### Configuration Details

| Option                 | Default                                                    | Description                                                               |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pusher`               | -                                                          | **Required.** Your configured Pusher-protocol client (`pusher-js`, `bun-pulse/client`, ...) |
| `decompress`           | `undefined`                                                | Function to decompress compressed subscription payloads                   |
| `subscriptionPath`     | `'lighthouse_subscriptions.channel'`                       | Dot-notation path to find the subscription channel in response extensions |
| `eventName`            | `'lighthouse-subscription'`                                | Name of the Pusher event to listen for                                    |
| `initialDataCondition` | `(data) => data.data && Object.keys(data.data).length > 0` | Function to determine when to pass initial subscription data              |

## 🏗️ Framework Examples

### Laravel Lighthouse

```typescript
// Default configuration works out of the box
const pusherLink = new PusherLink({ pusher });
```

Your Lighthouse GraphQL schema:

```graphql
type Subscription {
  postUpdated(id: ID!): Post
    @subscription(class: "App\\GraphQL\\Subscriptions\\PostUpdated")
}
```

### Hasura

```typescript
const pusherLink = new PusherLink({
  pusher,
  subscriptionPath: "extensions.hasura.channel",
  eventName: "hasura-subscription",
});
```

### Custom GraphQL Server

```typescript
const pusherLink = new PusherLink({
  pusher,
  subscriptionPath: "extensions.subscriptions.pusher_channel",
  eventName: "subscription-update",
  initialDataCondition: (data) => Boolean(data.data),
});
```

## 💡 Usage Examples

### Basic Subscription

```typescript
import { gql } from "@apollo/client/core";

const SUBSCRIPTION = gql`
  subscription OnCommentAdded($postId: ID!) {
    commentAdded(postId: $postId) {
      id
      content
      user {
        name
      }
    }
  }
`;

// In your component/composable
const { data, loading, error } = useSubscription(SUBSCRIPTION, {
  variables: { postId: "1" },
});
```

### With Compression Support

```typescript
import pako from "pako"; // or your preferred compression library

const pusherLink = new PusherLink({
  pusher,
  decompress: (compressedResult: string) => {
    const decompressed = pako.inflate(compressedResult, { to: "string" });
    return JSON.parse(decompressed);
  },
});
```

### Advanced Configuration

```typescript
const pusherLink = new PusherLink({
  pusher,
  subscriptionPath: "meta.subscription.channel",
  eventName: "subscription-data",
  initialDataCondition: (data) => {
    // Only pass initial data if it's not empty and not an error
    return data.data && !data.errors && Object.keys(data.data).length > 0;
  },
  decompress: (result: string) => JSON.parse(atob(result)), // Base64 decode
});
```

## 🔧 Integration Patterns

### With Authentication

```typescript
const authLink = new ApolloLink((operation, forward) => {
  operation.setContext({
    headers: {
      authorization: `Bearer ${getToken()}`,
    },
  });
  return forward(operation);
});

const client = new ApolloClient({
  link: ApolloLink.from([authLink, pusherLink, httpLink]),
  cache: new InMemoryCache(),
});
```

### With Error Handling

```typescript
import { ErrorLink } from "@apollo/client/link/error";

const errorLink = new ErrorLink(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.log(
        `GraphQL error: Message: ${message}, Location: ${locations}, Path: ${path}`
      )
    );
  }
  if (networkError) console.log(`Network error: ${networkError}`);
});

const client = new ApolloClient({
  link: ApolloLink.from([errorLink, pusherLink, httpLink]),
  cache: new InMemoryCache(),
});
```

### Framework-Specific Examples

#### Vue 3 + Nuxt

```typescript
// plugins/apollo.client.ts
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const pusher = new Pusher(config.public.pusherKey, {
    cluster: config.public.pusherCluster,
  });

  const pusherLink = new PusherLink({ pusher });

  const client = new ApolloClient({
    link: ApolloLink.from([pusherLink, httpLink]),
    cache: new InMemoryCache(),
  });

  return {
    provide: {
      apollo: client,
    },
  };
});
```

#### React

```typescript
import { ApolloProvider } from "@apollo/client";

const pusher = new Pusher(process.env.REACT_APP_PUSHER_KEY, {
  cluster: process.env.REACT_APP_PUSHER_CLUSTER,
});

const pusherLink = new PusherLink({ pusher });

const client = new ApolloClient({
  link: ApolloLink.from([pusherLink, httpLink]),
  cache: new InMemoryCache(),
});

function App() {
  return (
    <ApolloProvider client={client}>
      <YourApp />
    </ApolloProvider>
  );
}
```

## 🐛 Troubleshooting

### Subscriptions Not Working

1. **Check Pusher Configuration**: Ensure your Pusher credentials are correct
2. **Verify Subscription Path**: Make sure `subscriptionPath` matches your server's response format
3. **Check Event Name**: Verify the `eventName` matches what your server broadcasts
4. **Network Issues**: Ensure Pusher can connect (check firewall, proxy settings)

### Memory Leaks

The library automatically handles cleanup, but ensure you're properly unsubscribing:

```typescript
const subscription = client.subscribe({ query: SUBSCRIPTION });

// Later, when component unmounts or subscription is no longer needed
subscription.unsubscribe();
```

### TypeScript Issues

Make sure you have the correct types installed:

```bash
npm install --save-dev @types/pusher-js
```

## 🔍 Debugging

Enable debug mode for detailed logging:

```typescript
// Enable Pusher logging
Pusher.logToConsole = true;

const pusher = new Pusher("key", {
  cluster: "cluster",
  enabledTransports: ["ws", "wss"],
});
```

## 📊 Performance Considerations

- **Connection Pooling**: Reuse the same client instance across multiple PusherLink instances
- **Subscription Cleanup**: The library automatically handles cleanup, but always unsubscribe when components unmount
- **Batching**: Consider using Apollo's batching for mutations while keeping subscriptions separate

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built for the Laravel Lighthouse GraphQL community
- Inspired by the need for a modern, type-safe Pusher integration
- Thanks to the Apollo Client team for excellent GraphQL tooling
