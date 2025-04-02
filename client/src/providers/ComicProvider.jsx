import { useNavigate } from "react-router";
import { useCreateMyComics } from "../api/MyComicsApi";
import { ComicContext } from "../contexts/ComicContext";
import { useUserContext } from "../contexts/UserContext";
import { toast } from "react-toastify";

export default function ComicPrivider({ children }) {
    const { accessToken, setMyComicsId } = useUserContext();
    const { create } = useCreateMyComics();
    const navigate = useNavigate();

    async function buyComicHandler(comic) {
        if (!accessToken) {
            toast.warning('You must be logged in to buy comic');
            return navigate('/login');
        }

        await create(comic._id)
            .then(result => {
                setMyComicsId(m => [...m, result.myComicId]);
                navigate('/my-comics');
                toast.success(`You successfuly bought "${comic.title}"`)
            })
            .catch(err => toast.error(err.message));
    }

    function readComicHandler(comic) {
        return console.log('Reading comic ' + comic.title);
    }

    return (
        <ComicContext.Provider value={{ buyComicHandler, readComicHandler }} >
            {children}
        </ComicContext.Provider>
    );
}