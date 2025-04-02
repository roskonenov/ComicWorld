import { createContext, useContext } from "react";

export const UserContext = createContext({
    _id: '',
    username: '',
    email: '',
    accessToken: '',
    userLoginHandler: () => null,
    userLogoutHandler: () => null,
    myComicsId: [],
    setMyComicsId: () => null,
});

export function useUserContext(){
    return useContext(UserContext);
}