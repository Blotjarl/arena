import { PlayerId } from './ids';

/** A registered player identity (R1.1–R1.4). */
export class Player {
  constructor(
    /** Stable identifier for this player. */
    public readonly id: PlayerId,
    /** Chosen display name, 1-24 characters (R1.1). */
    public readonly username: string,
    /** When this player identity was first created. */
    public readonly createdAt: Date,
  ) {}
}
