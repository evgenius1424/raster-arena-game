interface Window {
    /** Room ID passed from lobby to game bootstrap */
    __GAME_ROOM_ID?: string
    /** Session ID passed from lobby to game bootstrap */
    __GAME_SESSION_ID?: string
    /** Player nickname passed from lobby to game bootstrap */
    __GAME_NICKNAME?: string
    /** Number of bots to auto-spawn on game start */
    __GAME_BOTS?: number
}
