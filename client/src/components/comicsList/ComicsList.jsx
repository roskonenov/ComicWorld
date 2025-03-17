import React, { useEffect, useMemo, useState } from "react";
import styles from "./ComicsList.module.css";
import useGetResources from "../../hooks/useGetResources";
import Spinner from "../spinner/Spinner";
import ComicItem from "../comic-item/ComicItem";
import Filter from "./filter/Filter";
import Pagination from "./pagination/Pagination";

const baseUrl = 'http://localhost:3030/jsonstore/comics-info';

export default function ComicsList() {

    const [displayComics, setDisplayComics] = useState([]);
    const [sortOrder, setSortOrder] = useState("desc");
    const [currentPage, setCurrentPage] = useState(1);
    const [search, setSearch] = useState('');
    const [isSorted, setIsSorted] = useState(false);
    const comicsPerPage = 12;

    const [loading, comicsData] = useGetResources(baseUrl, []);

    const filteredComics = useMemo(() => {
        return comicsData.filter(comic => {
            return search === '' || comic.title.toLowerCase().includes(search.toLowerCase());
        });
    }, [comicsData, search]);

    const sortedComics = useMemo(() => {
        return isSorted
        ? [...filteredComics].sort((a, b) => {
            return sortOrder === "asc"
                ? a.title.localeCompare(b.title)
                : b.title.localeCompare(a.title);
        })
        : filteredComics;
    }, [filteredComics, sortOrder]);

    const indexOfLastComic = currentPage * comicsPerPage;
    const indexOfFirstComic = indexOfLastComic - comicsPerPage;
    const paginatedComics = sortedComics.slice(indexOfFirstComic, indexOfLastComic);

    useEffect(() => {
        setDisplayComics(paginatedComics);

    }, [currentPage, filteredComics, sortOrder]);

    const handleSearchChange = (value) => {
        setSearch(value);
        setCurrentPage(1);
    };

    const sortHandler = () => {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        setIsSorted(true);
    };

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

            <Filter handleSort={sortHandler} sortOrder={sortOrder} onSearchChange={handleSearchChange} />

            <div className={styles['comic-list']}>
                {displayComics.map((comic) => <ComicItem key={comic._id} {...comic} />)}
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