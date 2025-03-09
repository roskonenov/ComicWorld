import { NavLink } from "react-router";
import styles from "./NavItem.module.css"

export default function NavItem({
    item
}) {
    return (
        <li className={styles['list-item']}>
            <NavLink
                className={styles.link}
                to={item.path}>
                {item.name}
            </NavLink>
        </li>
    );
}