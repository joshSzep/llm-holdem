declare module "pokersolver" {
  export class Hand {
    static solve(cards: string[]): Hand;
    static winners(hands: Hand[]): Hand[];
    cardPool: string[];
    name: string;
    descr: string;
    toString(): string;
  }
}
