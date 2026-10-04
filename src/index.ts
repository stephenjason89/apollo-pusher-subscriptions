import type { Observer } from 'rxjs'
import { ApolloLink, type FetchResult, type Operation } from '@apollo/client/core'
import { Observable } from '@apollo/client/utilities'

type GraphQLResponse = Record<string, unknown>
type RequestResult = FetchResult<GraphQLResponse>

// NextLink type for forward function
type NextLink = (operation: Operation) => Observable<RequestResult>

interface SubscriptionPayload {
	more: boolean
	compressed_result?: string
	result?: GraphQLResponse
}

/** Channel handle returned by `subscribe`; only `bind` is used. */
interface SubscriptionChannel {
	bind: (eventName: string, callback: (payload: SubscriptionPayload) => void) => unknown
}

/**
 * Any Pusher-protocol client, such as `pusher-js` or `bun-pulse/client`.
 * Only `subscribe` and `unsubscribe` are required.
 */
interface SubscriptionClient {
	subscribe: (channelName: string) => SubscriptionChannel
	unsubscribe: (channelName: string) => void
}

interface PusherLinkOptions {
	pusher: SubscriptionClient
	decompress?: (result: string) => GraphQLResponse
	subscriptionPath?: string
	eventName?: string
	initialDataCondition?: (data: RequestResult) => boolean
}

class PusherLink extends ApolloLink {
	pusher: SubscriptionClient
	decompress: (result: string) => GraphQLResponse
	subscriptionPath: string
	eventName: string
	initialDataCondition: (data: RequestResult) => boolean

	constructor(options: PusherLinkOptions) {
		super()
		// Retain a handle to the Pusher-protocol client
		this.pusher = options.pusher

		// Configuration options with Lighthouse defaults
		this.subscriptionPath = options.subscriptionPath ?? 'lighthouse_subscriptions.channel'
		this.eventName = options.eventName ?? 'lighthouse-subscription'
		this.initialDataCondition
			= options.initialDataCondition
				?? ((data: RequestResult) => Boolean(data.data && Object.keys(data.data).length > 0))

		if (options.decompress) {
			this.decompress = options.decompress
		}
		else {
			this.decompress = function (_result: string): GraphQLResponse {
				throw new Error(
					'Received compressed_result but PusherLink wasn\'t configured with `decompress: (result: string) => GraphQLResponse`. Add this configuration.',
				)
			}
		}
	}

	override request(operation: Operation, forward: NextLink): Observable<RequestResult> {
		return new Observable<RequestResult>((observer) => {
			let subscriptionChannel: string | undefined
			let pusherChannel: SubscriptionChannel

			// Check the result of the operation
			const resultObservable = forward(operation)

			// When the operation is done, try to get the subscription ID from the server
			const subscription = resultObservable.subscribe({
				next: (data) => {
					// Use configurable path to extract subscription channel
					subscriptionChannel = this.getNestedValue(data?.extensions, this.subscriptionPath)
					if (subscriptionChannel) {
						// Set up the channel subscription for updates from the server
						pusherChannel = this.pusher.subscribe(subscriptionChannel)
						// Pass along the initial payload if condition is met
						if (this.initialDataCondition(data)) {
							observer.next(data)
						}

						pusherChannel.bind(this.eventName, (payload: SubscriptionPayload) => {
							this._onUpdate(subscriptionChannel!, observer, payload)
						})
					}
					else {
						// This isn't a subscription,
						// So pass the data along and close the observer.
						observer.next(data)
						observer.complete()
					}
				},
				error: error => observer.error(error),
				// complete: observer.complete Don't pass this because Apollo unsubscribes if you do
			})

			// Return cleanup function
			return () => {
				subscription.unsubscribe()
				if (subscriptionChannel && pusherChannel) {
					this.pusher.unsubscribe(subscriptionChannel)
				}
			}
		})
	}

	/**
	 * Helper method to get nested value from object using dot notation
	 */
	private getNestedValue(obj: unknown, path: string): string | undefined {
		const result = path.split('.').reduce((current: any, key: string) => current?.[key], obj)
		return typeof result === 'string' ? result : undefined
	}

	_onUpdate(
		subscriptionChannel: string,
		observer: Observer<RequestResult>,
		payload: SubscriptionPayload,
	): void {
		let result: GraphQLResponse | undefined
		if (payload.compressed_result) {
			result = this.decompress(payload.compressed_result)
		}
		else {
			result = payload.result
		}
		if (result) {
			// Send the new response to listeners
			observer.next(result)
		}
		if (!payload.more) {
			// This is the end, the server says to unsubscribe
			this.pusher.unsubscribe(subscriptionChannel)
			observer.complete()
		}
	}
}

export default PusherLink
export type { PusherLinkOptions, SubscriptionChannel, SubscriptionClient, SubscriptionPayload }
