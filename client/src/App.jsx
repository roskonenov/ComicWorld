import { Route, Routes } from "react-router"
import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"
import ComicsList from "./components/comicsList/ComicsList"
import ComicDetails from "./components/comic-details/ComicDetails"
import LoginRegister from "./components/login-register/LoginRegister"
import { UserContext } from "./contexts/UserContext"
import { useState } from "react"

function App() {
  const [authData, setAuthData] = useState({});

  function userLoginHandler(data) {
    setAuthData(data);
  }

  return (
    <UserContext.Provider value={{ ...authData, userLoginHandler }}>
      <BackgroundVideo />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<ComicsList />} />
        <Route path="/catalog/:comicId" element={<ComicDetails />} />
        <Route path="/login" element={<LoginRegister />} />
        <Route path="/register" element={<LoginRegister />} />

      </Routes>
    </UserContext.Provider>
  )
}

export default App
