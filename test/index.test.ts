import type BunPulseClient from 'bun-pulse/client'
import type Pusher from 'pusher-js'
import type { SubscriptionClient, SubscriptionPayload } from '../src/index'
import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client/core'
import { Observable } from '@apollo/client/utilities'
import { expect, it, mock } from 'bun:test'
import PusherLink from '../src/index'

// Both official clients must satisfy the structural client type.
const _pusherJs: SubscriptionClient = {} as Pusher
const _bunPulse: SubscriptionClient = {} as BunPulseClient

const subscriptionQuery = gql`
	subscription OnChange {
		onChange {
			id
		}
	}
`

function fakeClient() {
	const handlers = new Map<string, (payload: SubscriptionPayload) => void>()
	const subscribe = mock((name: string) => ({
		bind: (_event: string, handler: (payload: SubscriptionPayload) => void) => handlers.set(name, handler),
	}))
	const unsubscribe = mock((_name: string) => {})
	return { client: { subscribe, unsubscribe }, handlers, subscribe, unsubscribe }
}

function apollo(client: SubscriptionClient, extensions?: Record<string, unknown>) {
	return new ApolloClient({
		cache: new InMemoryCache(),
		link: ApolloLink.from([
			new PusherLink({ pusher: client }),
			new ApolloLink(() => new Observable((observer) => {
				observer.next({ data: { onChange: null }, extensions })
				observer.complete()
			})),
		]),
	})
}

it('streams channel updates into the subscription and unsubscribes on teardown', async () => {
	const { client, handlers, subscribe, unsubscribe } = fakeClient()
	const results: unknown[] = []
	const subscription = apollo(client, { lighthouse_subscriptions: { channel: 'private-chan' } })
		.subscribe({ query: subscriptionQuery })
		.subscribe({ next: result => results.push(result.data) })
	await Bun.sleep(0)
	expect(subscribe).toHaveBeenCalledWith('private-chan')
	handlers.get('private-chan')!({ more: true, result: { data: { onChange: { id: '1' } } } })
	expect(results).toEqual([{ onChange: null }, { onChange: { id: '1' } }])
	subscription.unsubscribe()
	await Bun.sleep(5) // Apollo tears the link down in a setTimeout
	expect(unsubscribe).toHaveBeenCalledWith('private-chan')
})

it('completes and unsubscribes when the server sends the final payload', async () => {
	const { client, handlers, unsubscribe } = fakeClient()
	let completed = false
	apollo(client, { lighthouse_subscriptions: { channel: 'private-chan' } })
		.subscribe({ query: subscriptionQuery })
		.subscribe({ complete: () => { completed = true } })
	await Bun.sleep(0)
	handlers.get('private-chan')!({ more: false })
	expect(completed).toBe(true)
	expect(unsubscribe).toHaveBeenCalledWith('private-chan')
})

it('passes non-subscription results through untouched', async () => {
	const { client, subscribe } = fakeClient()
	const result = await apollo(client).query({ query: gql`query { onChange { id } }` })
	expect(result.data).toEqual({ onChange: null })
	expect(subscribe).not.toHaveBeenCalled()
})
