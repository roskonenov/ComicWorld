import { Route, Routes } from "react-router"
import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"
import ComicsList from "./components/comicsList/ComicsList"

function App() {

  return (
    <>
      <BackgroundVideo />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/all-comics" element={<ComicsList />} />
      </Routes>
    </>
  )
}

export default App
