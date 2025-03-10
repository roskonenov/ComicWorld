import { Route, Routes } from "react-router"
import BackgroundVideo from "./components/background/BackgroundVideo"
import Header from "./components/header/Header"
import Home from "./components/home/Home"

function App() {

  return (
    <>
      <BackgroundVideo />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  )
}

export default App
