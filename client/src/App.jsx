import { Route, Routes } from "react-router"
import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"
import ComicsList from "./components/comicsList/ComicsList"
import ComicDetails from "./components/comic-details/ComicDetails"
import LoginRegister from "./components/login-register/LoginRegister"

function App() {

  return (
    <>
      <BackgroundVideo />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<ComicsList />} />
        <Route path="/catalog/:comicId" element={<ComicDetails />} />
        <Route path="/loginRegister" element={<LoginRegister />} />
      </Routes>
    </>
  )
}

export default App
