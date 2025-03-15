import React, { useState } from "react";
import styles from "./ComicsList.module.css";
import useGetResources from "../../hooks/useGetResource";
import Spinner from "../spinner/Spinner";
import ComicItem from "../comic-item/ComicItem";

const baseUrl = 'http://localhost:3030/jsonstore/comics-info';

export default function ComicsList() {

    const [displayComics, setDisplayComics] = useState([]);
    const [sortOrder, setSortOrder] = useState("asc");
    const [currentPage, setCurrentPage] = useState(1);
    const comicsPerPage = 4;

    const [loading, comicsData] = useGetResources(baseUrl);
    // setDisplayComics(comicsData);

    const sortedComics = [...comicsData].sort((a, b) => {
        return sortOrder === "asc"
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title);
    });

    const indexOfLastComic = currentPage * comicsPerPage;
    const indexOfFirstComic = indexOfLastComic - comicsPerPage;
    const currentComics = sortedComics.slice(indexOfFirstComic, indexOfLastComic);

    const handleSort = () => {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    };

    const nextPage = () => {
        if (currentPage < Math.ceil(comicsData.length / comicsPerPage)) {
            setCurrentPage(currentPage + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    if (loading) {
        return <Spinner />;
    }

    return (
        <div className={styles['comic-container']}>
            <button className={styles['sort-button']} onClick={handleSort}>
                Sort {sortOrder === "asc" ? "Descending" : "Ascending"}
            </button>
            <div className={styles['comic-list']}>
                {comicsData.map((comic) => <ComicItem key={comic._id} {...comic} />)}
            </div>
            <div className={styles['pagination']}>
                <button onClick={prevPage} disabled={currentPage === 1}>
                    Prev
                </button>
                <span>Page {currentPage}</span>
                <button
                    onClick={nextPage}
                    disabled={currentPage === Math.ceil(comicsData.length / comicsPerPage)}
                >
                    Next
                </button>
            </div>
        </div>
    );
}