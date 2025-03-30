import { createContext } from "react";

export const UserContext = createContext({
    _id: '',
    username: '',
    email: '',
    accessToken: '',
    userLoginHandler: () => null,
    userLogoutHandler: () => null,
});