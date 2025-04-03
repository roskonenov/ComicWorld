import { useEffect } from "react";
import { useMyComicsId } from "../api/MyComicsApi";
import { UserContext } from "../contexts/UserContext";
import usePersistedState from "../hooks/usePersistedState";

export default function UserProvider({ children }) {
    const [authData, setAuthData] = usePersistedState('auth', {});
    const [myComicsId, setMyComicsId] = usePersistedState('myComics', []);
    const [_, setCurrentComic] = usePersistedState('comic', []);
    const {comicsId} = useMyComicsId(authData?._id);

    useEffect(()=> {
      if(authData?._id) {
        setMyComicsId(prevComics => {
          const isSynced = comicsId.every(id => prevComics.includes(id));
          return isSynced ? prevComics : comicsId;
      });
      }
    },[comicsId, setMyComicsId, authData]);
    
    function userLoginHandler(data) {
      setAuthData(data);
      setMyComicsId([]);
    }
    
    function userLogoutHandler() {
      setAuthData({});
      setMyComicsId([]);
      setCurrentComic({});
      localStorage.removeItem("myComics");
    }
    
    return (
        <UserContext.Provider value={{ ...authData, userLoginHandler, userLogoutHandler, myComicsId, setMyComicsId }}>
            {children}
        </UserContext.Provider>
    );
}