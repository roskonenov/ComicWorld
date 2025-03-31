import { UserContext } from "../contexts/UserContext";
import usePersistedState from "../hooks/usePersistedState";

export default function UserProvider({ children }) {
    const [authData, setAuthData] = usePersistedState('auth', {});

    function userLoginHandler(data) {
      setAuthData(data);
    }
  
    function userLogoutHandler() {
      setAuthData({});
    }
    return (
        <UserContext.Provider value={{ ...authData, userLoginHandler, userLogoutHandler }}>
            {children}
        </UserContext.Provider>
    );
}