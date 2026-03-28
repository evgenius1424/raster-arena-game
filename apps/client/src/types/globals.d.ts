interface Window {
    /** Room ID passed from lobby to game bootstrap */
    __NFF_ROOM_ID?: string
    /** Session ID passed from lobby to game bootstrap */
    __NFF_SESSION_ID?: string
    /** Player nickname passed from lobby to game bootstrap */
    __NFF_NICKNAME?: string
    /** Number of bots to auto-spawn on game start */
    __NFF_BOTS?: number
}
