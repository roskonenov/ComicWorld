import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"
import ComicsList from "./components/comicsList/ComicsList"
import ComicDetails from "./components/comic-details/ComicDetails"
import LoginRegister from "./components/login-register/LoginRegister"
import Logout from "./components/logout/Logout"

import { Route, Routes } from "react-router"
import { UserContext } from "./contexts/UserContext"
import usePersistedState from "./hooks/usePersistedState"

function App() {
  const [authData, setAuthData] = usePersistedState('auth', {});

  function userLoginHandler(data) {
    setAuthData(data);
  }

  function userLogoutHandler() {
    setAuthData({});
  }

  return (
    <UserContext.Provider value={{ ...authData, userLoginHandler, userLogoutHandler }}>
      <BackgroundVideo />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<ComicsList />} />
        <Route path="/catalog/:comicId" element={<ComicDetails />} />
        <Route path="/login" element={<LoginRegister />} />
        <Route path="/register" element={<LoginRegister />} />
        <Route path="/logout" element={<Logout />} />
      </Routes>
    </UserContext.Provider>
  )
}

export default App
