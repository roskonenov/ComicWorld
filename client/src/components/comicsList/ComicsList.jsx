import { useCallback, useMemo, useState } from "react";
import styles from "./ComicsList.module.css";
import Spinner from "../spinner/Spinner";
import ComicItem from "../comic-item/ComicItem";
import Filter from "./filter/Filter";
import Pagination from "./pagination/Pagination";
import { useComics } from "../../api/comicApi";



export default function ComicsList() {

    const [sortOrder, setSortOrder] = useState("desc");
    const [currentPage, setCurrentPage] = useState(1);
    const [search, setSearch] = useState('');
    const [isSorted, setIsSorted] = useState(false);
    const comicsPerPage = 12;

    const [loading, comicsData] = useComics();

    const filteredComics = useMemo(() => {
        return comicsData.filter(comic =>
            search === '' || comic.title.toLowerCase().includes(search.toLowerCase())
        );
    }, [comicsData, search]);

    const sortedComics = useMemo(() => {
        return isSorted
            ? [...filteredComics].sort((a, b) => {
                return sortOrder === "asc"
                    ? a.title.localeCompare(b.title)
                    : b.title.localeCompare(a.title);
            })
            : filteredComics;
    }, [filteredComics, sortOrder, isSorted]);

    const indexOfLastComic = currentPage * comicsPerPage;
    const indexOfFirstComic = indexOfLastComic - comicsPerPage;
    const paginatedComics = sortedComics.slice(indexOfFirstComic, indexOfLastComic);

    const displayComics = useMemo(() => paginatedComics, [paginatedComics]);

    const searchChangeHandler = (value) => {
        setSearch(value);
        setCurrentPage(1);
    };

    const sortHandler = useCallback(() => {
        setSortOrder(s => s === "asc" ? "desc" : "asc");
        setIsSorted(true);
    }, []);

    const nextPage = () => {
        if (currentPage < Math.ceil(filteredComics.length / comicsPerPage)) {
            setCurrentPage(c => c + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(c => c - 1);
        }
    };

    if (loading) {
        return <Spinner />;
    }

    return (
        <div className={styles['comic-container']}>

            <Filter handleSort={sortHandler} sortOrder={sortOrder} onSearchChange={searchChangeHandler} />

            <div className={styles['comic-list']}>
                {displayComics.length === 0
                    ? <h1 className={styles['no-comics']}>There are no Comics to display!</h1>
                    : displayComics.map((comic) => <ComicItem key={comic._id} comic={comic} />)}
                { }
            </div>

            <Pagination
                prevPage={prevPage}
                currentPage={currentPage}
                nextPage={nextPage}
                comicsData={filteredComics}
                comicsPerPage={comicsPerPage}
            />
        </div>
    );
}