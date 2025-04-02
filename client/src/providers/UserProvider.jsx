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
      if(comicsId.length > 0 && myComicsId.length === 0) {
        setMyComicsId(comicsId);
      }
    },[comicsId, setMyComicsId, myComicsId])
    
    function userLoginHandler(data) {
      setAuthData(data);
    }
    
    function userLogoutHandler() {
      setAuthData({});
      setMyComicsId([]);
      setCurrentComic({});
    }

    useEffect(() => {
      setMyComicsId(myComicsId);
  }, [myComicsId, setMyComicsId]);

    return (
        <UserContext.Provider value={{ ...authData, userLoginHandler, userLogoutHandler, myComicsId, setMyComicsId }}>
            {children}
        </UserContext.Provider>
    );
}